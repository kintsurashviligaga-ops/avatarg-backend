/**
 * Avatar G — Music Worker (Production, SAFE)
 * File: worker/music-worker.js
 *
 * Fixes:
 * - Never call ElevenLabs if no job or missing prompt
 * - Correctly parse RPC result (array/object)
 * - Robust retries + safe job state updates
 *
 * Required env:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - ELEVENLABS_API_KEY
 *
 * Optional env:
 * - WORKER_ID
 * - POLL_INTERVAL_MS (default 3000)
 * - CLAIM_RPC_NAME (default claim_next_music_job)
 * - MUSIC_BUCKET (default music)
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 3000);
const CLAIM_RPC_NAME = process.env.CLAIM_RPC_NAME || "claim_next_music_job";
const MUSIC_BUCKET = process.env.MUSIC_BUCKET || "music";

const WORKER_ID =
  process.env.WORKER_ID || `worker-${crypto.randomBytes(4).toString("hex")}`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
  console.error("❌ Missing env vars. Required:");
  console.error("   SUPABASE_URL");
  console.error("   SUPABASE_SERVICE_ROLE_KEY");
  console.error("   ELEVENLABS_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickFirstJob(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data[0] : null;
  if (typeof data === "object") return data;
  return null;
}

async function markJobError(jobId, code, message) {
  try {
    await supabase
      .from("music_jobs")
      .update({
        status: "error",
        error_code: code ? String(code) : null,
        error_message: message ? String(message) : "Unknown error",
        error_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (e) {
    console.error("❌ Failed to update job error:", e?.message || e);
  }
}

async function markJobDone(jobId, audioPath) {
  try {
    await supabase
      .from("music_jobs")
      .update({
        status: "done",
        audio_path: audioPath,
        completed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        error_at: null,
      })
      .eq("id", jobId);
  } catch (e) {
    console.error("❌ Failed to update job done:", e?.message || e);
  }
}

async function claimNextJob() {
  // Most common param name: p_worker_id
  // If your SQL function uses a different name, set CLAIM_RPC_NAME & param in SQL accordingly.
  const attempts = [
    { p_worker_id: WORKER_ID },
    { worker_id: WORKER_ID },
    { p_worker: WORKER_ID },
  ];

  for (const params of attempts) {
    const { data, error } = await supabase.rpc(CLAIM_RPC_NAME, params);
    if (!error) return pickFirstJob(data);
  }

  // If all attempts fail, return null (will sleep)
  return null;
}

async function elevenLabsGenerateAudio(text) {
  // Endpoint you use already:
  const url = "https://api.elevenlabs.io/v1/sound-generation";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "content-type": "application/json",
      accept: "*/*",
    },
    body: JSON.stringify({
      text, // ✅ REQUIRED (your error says body.text missing)
    }),
  });

  // Try JSON error body
  if (!res.ok) {
    let errText = "";
    try {
      errText = await res.text();
    } catch {}
    const status = res.status;
    throw new Error(`ElevenLabs HTTP ${status}: ${errText}`);
  }

  const contentType = res.headers.get("content-type") || "";

  // If ElevenLabs returns audio bytes:
  if (contentType.includes("audio") || contentType.includes("octet-stream")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { kind: "audio", buffer: buf };
  }

  // Otherwise assume JSON
  const json = await res.json();

  // Support base64 fields (some APIs return audio as base64)
  if (json?.audio_base64) {
    const buf = Buffer.from(json.audio_base64, "base64");
    return { kind: "audio", buffer: buf };
  }

  // Support URL field
  if (json?.audio_url) {
    // download it
    const dl = await fetch(json.audio_url);
    if (!dl.ok) throw new Error(`Failed to download audio_url: ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    return { kind: "audio", buffer: buf };
  }

  // If nothing matched:
  throw new Error(`ElevenLabs response missing audio (content-type: ${contentType})`);
}

async function uploadAudio(jobId, buffer) {
  const filename = `jobs/${jobId}.mp3`;
  const { error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .upload(filename, buffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (error) throw new Error(`Storage upload error: ${error.message}`);
  return filename;
}

async function loop() {
  console.log("✅ Config OK");
  console.log("🎵 MUSIC WORKER — SAFE FINAL");
  console.log("DB table: music_jobs");
  console.log("Bucket:", MUSIC_BUCKET);
  console.log("Endpoint: https://api.elevenlabs.io/v1/sound-generation");
  console.log("Poll:", `${POLL_INTERVAL_MS}ms`);
  console.log("RPC:", CLAIM_RPC_NAME);
  console.log("Worker ID:", WORKER_ID);
  console.log("====================================================");

  while (true) {
    try {
      const job = await claimNextJob();

      if (!job) {
        console.log("⏳ No job. Sleeping...");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const jobId = job.id;
      const prompt =
        job.prompt ??
        job.text ??
        job.input_text ??
        job.request_text ??
        null;

      console.log("🎯 Claimed job:", jobId);

      if (!jobId) {
        console.warn("⚠️ Claimed job missing id. Skipping.");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (!prompt || String(prompt).trim().length === 0) {
        console.warn("⚠️ Job prompt missing. Marking error.");
        await markJobError(jobId, "400", "Missing prompt/text in job row");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // Generate
      const result = await elevenLabsGenerateAudio(String(prompt));

      if (result?.kind !== "audio" || !result.buffer) {
        throw new Error("ElevenLabs returned no audio buffer");
      }

      // Upload
      const audioPath = await uploadAudio(jobId, result.buffer);

      // Done
      await markJobDone(jobId, audioPath);

      console.log("✅ Completed:", jobId, "->", audioPath);
      await sleep(250); // tiny pause
    } catch (err) {
      console.error("❌ MUSIC WORKER ERROR");
      console.error("err:", err?.message || err);
      // IMPORTANT: do NOT crash; just backoff a bit
      await sleep(2000);
    }
  }
}

loop().catch((e) => {
  console.error("Fatal:", e?.message || e);
  process.exit(1);
});
