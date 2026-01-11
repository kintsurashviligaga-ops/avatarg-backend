/**
 * Avatar G — Music Worker (Production)
 * Fix: ALWAYS call RPC with correct parameter object (p_worker_id)
 *
 * Required .env:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - ELEVENLABS_API_KEY
 * Optional:
 *  - WORKER_ID
 *  - POLL_INTERVAL_MS
 *  - CLAIM_RPC_NAME (default: claim_next_music_job)
 *  - MUSIC_BUCKET (default: music)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
  console.error('❌ Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WORKER_ID =
  (process.env.WORKER_ID && String(process.env.WORKER_ID).trim()) ||
  `worker-${crypto.randomUUID().slice(0, 8)}`;

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 3000);
const CLAIM_RPC_NAME = (process.env.CLAIM_RPC_NAME || 'claim_next_music_job').trim();
const MUSIC_BUCKET = (process.env.MUSIC_BUCKET || 'music').trim();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isNoParamRpcError(msg = '') {
  const s = String(msg).toLowerCase();
  return (
    s.includes('without parameters') ||
    s.includes('could not find the function') ||
    s.includes('schema cache')
  );
}

async function claimNextJob() {
  // IMPORTANT: Always pass params
  const payloadPrimary = { p_worker_id: WORKER_ID };

  // In case your SQL function parameter name differs, we try fallbacks.
  const payloadFallbacks = [
    { worker_id: WORKER_ID },
    { p_worker: WORKER_ID },
  ];

  // 1) Primary try: p_worker_id
  let res = await supabase.rpc(CLAIM_RPC_NAME, payloadPrimary);
  if (!res.error) return res.data;

  // 2) If error looks like "no parameters" or cache mismatch, try fallbacks
  const errMsg = res.error?.message || String(res.error);
  if (isNoParamRpcError(errMsg)) {
    for (const payload of payloadFallbacks) {
      const r2 = await supabase.rpc(CLAIM_RPC_NAME, payload);
      if (!r2.error) return r2.data;
    }
  }

  // Throw original error
  throw res.error;
}

async function markJobError(jobId, err) {
  const msg =
    err?.response?.data
      ? JSON.stringify(err.response.data)
      : err?.message || String(err);

  const code = err?.response?.status ? String(err.response.status) : null;

  await supabase
    .from('music_jobs')
    .update({
      status: 'error',
      error_code: code,
      error_message: msg,
      error_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

async function markJobDone(jobId, audioPath, durationMs) {
  await supabase
    .from('music_jobs')
    .update({
      status: 'done',
      audio_path: audioPath,
      completed_at: new Date().toISOString(),
      processing_duration_ms: durationMs,
    })
    .eq('id', jobId);
}

async function callElevenLabs(prompt) {
  // NOTE: You already have working endpoint in your codebase.
  // Keep this minimal — just an example skeleton.
  const url = 'https://api.elevenlabs.io/v1/sound-generation';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      text: prompt,
    }),
  });

  if (!resp.ok) {
    const data = await resp.text().catch(() => '');
    const e = new Error(`ElevenLabs error: ${resp.status} ${data}`);
    e.response = { status: resp.status, data };
    throw e;
  }

  // ElevenLabs may return audio bytes or JSON depending on endpoint.
  // Adjust to your real response format. Here we assume audio bytes:
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadToStorage(jobId, audioBuffer) {
  const filePath = `jobs/${jobId}.mp3`;

  const { error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (error) throw error;
  return filePath;
}

async function loop() {
  console.log('✅ Config OK');
  console.log('==================================================');
  console.log('🎵 MUSIC WORKER — FINAL (Atomic + Prompt-Only)');
  console.log('==================================================');
  console.log('DB table:', 'music_jobs');
  console.log('Bucket:', MUSIC_BUCKET);
  console.log('Endpoint:', 'https://api.elevenlabs.io/v1/sound-generation');
  console.log('Poll:', `${POLL_INTERVAL_MS}ms`);
  console.log('RPC:', CLAIM_RPC_NAME);
  console.log('Worker ID:', WORKER_ID);
  console.log('==================================================');

  let errCount = 0;

  while (true) {
    try {
      const job = await claimNextJob();

      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      errCount = 0;

      const started = Date.now();
      const jobId = job.id;

      console.log('🎧 Claimed job:', jobId);

      // Generate audio
      const audioBuffer = await callElevenLabs(job.prompt);

      // Upload
      const audioPath = await uploadToStorage(jobId, audioBuffer);

      const durationMs = Date.now() - started;
      await markJobDone(jobId, audioPath, durationMs);

      console.log('✅ Job completed:', jobId, 'duration_ms=', durationMs, 'audio_path=', audioPath);
    } catch (err) {
      errCount += 1;
      const msg = err?.message || String(err);
      console.error(`⚠️ Worker error #${errCount}:`, msg);

      // If we still see "without parameters", it means DB function exists but worker call is wrong
      // This code should fix it, but if Supabase cache is stale, a schema reload helps.
      if (isNoParamRpcError(msg)) {
        console.error('ℹ️ Looks like PostgREST schema cache mismatch OR RPC param mismatch.');
        console.error("➡️ Run in Supabase SQL Editor: NOTIFY pgrst, 'reload schema'; SELECT pg_sleep(5);");
      }

      const backoff = Math.min(30000, 2000 * errCount);
      console.log(`⏳ Retry in ${backoff}ms...`);
      await sleep(backoff);
    }
  }
}

loop();
