/**
 * Avatar G — Music Worker (Production)
 * File: worker/music-worker.js
 *
 * Fixes:
 * - Calls RPC with correct parameter name: { p_worker_id: ... }
 * - Robust logging + retry loop
 * - Safe job state updates
 *
 * Required .env:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - WORKER_ID (optional)
 * - POLL_INTERVAL_MS (optional)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const WORKER_ID =
  process.env.WORKER_ID ||
  `music-worker-${Math.random().toString(16).slice(2)}-${Date.now()}`;

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 3000);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function markJobError(jobId, err) {
  const errorCode =
    err?.code?.toString?.() ||
    err?.status?.toString?.() ||
    err?.response?.status?.toString?.() ||
    null;

  const errorMessage =
    (err?.response?.data && JSON.stringify(err.response.data)) ||
    err?.message ||
    String(err);

  await supabase
    .from('music_jobs')
    .update({
      status: 'error',
      error_code: errorCode,
      error_message: errorMessage,
      error_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

async function completeJob(jobId, audioPath, durationMs) {
  await supabase
    .from('music_jobs')
    .update({
      status: 'done',
      audio_bucket: 'music',
      audio_path: audioPath,
      completed_at: new Date().toISOString(),
      processing_duration_ms: durationMs,
    })
    .eq('id', jobId);
}

/**
 * TODO: აქ ჩასვი შენი რეალური მუსიკის გენერაცია + ატვირთვა storage-ში.
 * ამ ეტაპზე — dummy completion, რომ დავადასტუროთ RPC + flow მუშაობს.
 */
async function generateAndUploadAudio(job) {
  // მაგ: const audioBuffer = await generateMusicWithSuno(job.prompt)
  // მერე upload Supabase storage-ში.
  // ახლა ვაკეთებთ fake path-ს:
  const fakePath = `jobs/${job.id}.mp3`;
  return fakePath;
}

async function claimNextJob() {
  // ✅ CRITICAL: must pass p_worker_id
  const { data, error } = await supabase.rpc('claim_next_music_job', {
    p_worker_id: WORKER_ID,
  });

  if (error) throw error;

  // Supabase returns array for SETOF
  if (!data || (Array.isArray(data) && data.length === 0)) return null;

  return Array.isArray(data) ? data[0] : data;
}

async function mainLoop() {
  console.log('========================================');
  console.log('🎵 Avatar G Music Worker — STARTED');
  console.log('Worker ID:', WORKER_ID);
  console.log('Poll interval ms:', POLL_INTERVAL_MS);
  console.log('========================================');

  while (true) {
    try {
      const job = await claimNextJob();

      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const started = Date.now();
      console.log(`✅ Claimed job: ${job.id}`);

      // Generate audio + upload
      const audioPath = await generateAndUploadAudio(job);

      const durationMs = Date.now() - started;
      await completeJob(job.id, audioPath, durationMs);

      console.log(`🎉 Completed job: ${job.id} in ${durationMs}ms`);
    } catch (err) {
      // Most common error you had:
      // "Could not find the function public.claim_next_music_job without parameters"
      console.error('❌ WORKER LOOP ERROR');
      console.error(err);

      // Wait a bit then retry loop
      await sleep(5000);
    }
  }
}

// Start
mainLoop().catch((e) => {
  console.error('❌ Fatal worker error:', e);
  process.exit(1);
});
