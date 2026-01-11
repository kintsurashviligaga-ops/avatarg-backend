/**
 * Avatar G — Music Worker (Production) — FINAL
 * File: worker/music-worker.js
 *
 * Fixes:
 * - ALWAYS calls RPC with correct param name: { p_worker_id: ... }
 * - Never calls claim_next_music_job() without parameters (prevents schema cache error)
 * - Robust retry loop + jitter
 * - Safe job state updates (done/error)
 *
 * Required .env:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - ELEVENLABS_API_KEY
 *
 * Optional .env:
 * - WORKER_ID
 * - POLL_INTERVAL_MS (default 3000)
 * - CLAIM_RETRY_MS (default 10000)
 * - STALE_RECOVERY_EVERY_LOOPS (default 120)  // every N loops call fail_stale_music_jobs(15)
 * - STALE_MINUTES (default 15)
 * - JOB_TIMEOUT_MS (default 600000) // 10 min
 */

import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const WORKER_ID =
  (process.env.WORKER_ID && String(process.env.WORKER_ID).trim()) ||
  `music-worker-${process.pid}`;

const POLL_INTERVAL_MS = toInt(process.env.POLL_INTERVAL_MS, 3000);
const CLAIM_RETRY_MS = toInt(process.env.CLAIM_RETRY_MS, 10000);
const STALE_RECOVERY_EVERY_LOOPS = toInt(process.env.STALE_RECOVERY_EVERY_LOOPS, 120);
const STALE_MINUTES = toInt(process.env.STALE_MINUTES, 15);
const JOB_TIMEOUT_MS = toInt(process.env.JOB_TIMEOUT_MS, 10 * 60 * 1000);

const DB_TABLE = 'music_jobs';
const BUCKET = 'music';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
  console.error('❌ Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      'X-Client-Info': `avatar-g-music-worker/${WORKER_ID}`,
    },
  },
});

function toInt(v, fallback) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms, pct = 0.2) {
  const delta = ms * pct;
  const rand = (Math.random() * 2 - 1) * delta;
  return Math.max(250, Math.floor(ms + rand));
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * CRITICAL:
 * This MUST always pass { p_worker_id: WORKER_ID }
 * Never call RPC without parameters.
 */
async function claimNextJob() {
  const { data, error } = await supabase.rpc('claim_next_music_job', {
    p_worker_id: WORKER_ID,
  });

  if (error) {
    return { job: null, error };
  }
  const job = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return { job, error: null };
}

async function recoverStaleJobs() {
  // This RPC is service_role only.
  const { data, error } = await supabase.rpc('fail_stale_music_jobs', {
    stale_minutes: STALE_MINUTES,
  });

  if (error) {
    console.warn('⚠️ fail_stale_music_jobs error:', error.message);
    return;
  }

  if (typeof data === 'number' && data > 0) {
    console.log(`♻️ Recovered stale jobs: ${data}`);
  }
}

/**
 * Generate music via ElevenLabs Sound Generation API.
 * Returns Buffer (mp3) or throws.
 */
async function generateMusic(prompt, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: prompt,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await safeReadText(res);
      const err = new Error(`ElevenLabs API error: ${res.status} ${res.statusText} ${txt ? `— ${txt}` : ''}`);
      err.status = res.status;
      err.responseText = txt;
      throw err;
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } finally {
    clearTimeout(t);
  }
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function uploadAudio(jobId, audioBuf) {
  const path = `jobs/${jobId}.mp3`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, audioBuf, {
      contentType: 'audio/mpeg',
      upsert: true,
      cacheControl: '3600',
    });

  if (upErr) throw upErr;

  return { bucket: BUCKET, path };
}

async function markJobDone(jobId, { bucket, path }, durationMs) {
  const { error } = await supabase
    .from(DB_TABLE)
    .update({
      status: 'done',
      audio_bucket: bucket,
      audio_path: path,
      completed_at: nowIso(),
      processing_duration_ms: durationMs,
      error_code: null,
      error_message: null,
      error_at: null,
    })
    .eq('id', jobId);

  if (error) throw error;
}

async function markJobError(jobId, err, nextRetrySeconds = 30) {
  const errorCode =
    (err && typeof err.status === 'number' && String(err.status)) ||
    (err && err.code && String(err.code)) ||
    'WORKER_ERROR';

  const errorMessage =
    err?.responseText
      ? String(err.responseText).slice(0, 5000)
      : err?.message
      ? String(err.message).slice(0, 5000)
      : String(err).slice(0, 5000);

  const nextRetryAt = new Date(Date.now() + nextRetrySeconds * 1000).toISOString();

  // Note: attempts increment is typically done by stale recovery or your own logic.
  // Here we just re-queue the job with a retry delay.
  const { error } = await supabase
    .from(DB_TABLE)
    .update({
      status: 'queued',
      worker_id: null,
      next_retry_at: nextRetryAt,
      error_code: errorCode,
      error_message: errorMessage,
      error_at: nowIso(),
    })
    .eq('id', jobId);

  if (error) throw error;
}

async function mainLoop() {
  console.log('✅ Config OK');
  console.log('===============================================');
  console.log('🎵 MUSIC WORKER — FINAL (Atomic + Prompt-Only)');
  console.log('===============================================');
  console.log('DB table:', DB_TABLE);
  console.log('Bucket:', `${BUCKET}`);
  console.log('Endpoint:', 'https://api.elevenlabs.io/v1/sound-generation');
  console.log('Poll:', `${POLL_INTERVAL_MS}ms`);
  console.log('Timeout:', `${Math.round(JOB_TIMEOUT_MS / 1000)}s`);
  console.log('RPC:', 'claim_next_music_job(p_worker_id text)');
  console.log('Worker ID:', WORKER_ID);
  console.log('===============================================');

  let loops = 0;

  while (true) {
    loops += 1;

    // periodic stale recovery
    if (STALE_RECOVERY_EVERY_LOOPS > 0 && loops % STALE_RECOVERY_EVERY_LOOPS === 0) {
      await recoverStaleJobs();
    }

    const { job, error: claimErr } = await claimNextJob();

    if (claimErr) {
      // If schema cache still stale, this will show here; keep retrying.
      console.error(
        `⚠️ Worker error: Failed to claim job (rpc claim_next_music_job): ${claimErr.message}`
      );
      await sleep(jitter(CLAIM_RETRY_MS));
      continue;
    }

    if (!job) {
      await sleep(jitter(POLL_INTERVAL_MS));
      continue;
    }

    const jobId = job.id;
    const prompt = job.prompt;

    const start = Date.now();
    console.log(`🧾 Claimed job: ${jobId}`);

    try {
      // Generate audio
      const audioBuf = await generateMusic(prompt, JOB_TIMEOUT_MS);

      // Upload
      const uploaded = await uploadAudio(jobId, audioBuf);

      // Mark done
      const durationMs = Date.now() - start;
      await markJobDone(jobId, uploaded, durationMs);

      console.log(`✅ Completed job: ${jobId} (${durationMs}ms) → ${uploaded.path}`);
    } catch (err) {
      console.error('❌ MUSIC GENERATION ERROR');
      console.error('err:', err);
      console.error('err.message:', err?.message);
      console.error('err.status:', err?.status);

      try {
        // retry delay: longer for rate limits, shorter otherwise
        const retrySec = err?.status === 429 ? 90 : 30;
        await markJobError(jobId, err, retrySec);
        console.log(`↩️ Re-queued job: ${jobId} (retry in ${retrySec}s)`);
      } catch (dbErr) {
        console.error('🔥 Failed to update job status in DB:', dbErr?.message || dbErr);
      }

      await sleep(jitter(2000));
    }
  }
}

process.on('SIGINT', () => {
  console.log('👋 SIGINT — shutting down');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM — shutting down');
  process.exit(0);
});

mainLoop().catch((e) => {
  console.error('🔥 Fatal worker crash:', e?.message || e);
  process.exit(1);
});
