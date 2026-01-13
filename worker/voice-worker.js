/**
 * worker/voice-worker.js
 * Avatar G — Voice Worker (ElevenLabs TTS) → Supabase Storage → updates voice_jobs
 *
 * ✅ Requires env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ELEVENLABS_API_KEY
 *
 * Optional env:
 *   ELEVENLABS_BASE_URL="https://api.elevenlabs.io/v1"
 *   VOICE_BUCKET="voice"                   (Supabase Storage bucket)
 *   VOICE_SIGNED_URL_TTL_SECONDS="604800"  (7 days)
 *   POLL_INTERVAL_MS="1500"
 *   JOB_TIMEOUT_MS="90000"
 *   MAX_RETRIES="3"
 *
 * Expected minimal columns in voice_jobs:
 *   id, status, text, voice_id, model_id, settings, audio_url, audio_path,
 *   error_message, retries, created_at, updated_at, started_at, completed_at
 */

import { createClient } from "@supabase/supabase-js";

const CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_BASE_URL: process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io/v1",

  VOICE_BUCKET: process.env.VOICE_BUCKET || "voice",
  VOICE_SIGNED_URL_TTL_SECONDS: parseInt(process.env.VOICE_SIGNED_URL_TTL_SECONDS || "604800", 10),

  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || "1500", 10),
  JOB_TIMEOUT_MS: parseInt(process.env.JOB_TIMEOUT_MS || "90000", 10),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "3", 10),
};

function requireEnv(name, value) {
  if (!value) throw new Error(`❌ Missing ${name}`);
}

requireEnv("SUPABASE_URL", CONFIG.SUPABASE_URL);
requireEnv("SUPABASE_SERVICE_ROLE_KEY", CONFIG.SUPABASE_SERVICE_ROLE_KEY);
requireEnv("ELEVENLABS_API_KEY", CONFIG.ELEVENLABS_API_KEY);

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "(failed to read body)";
  }
}

/** ElevenLabs TTS → returns Buffer(mp3) */
async function elevenLabsTTS({ text, voice_id, model_id, settings }) {
  const url = `${CONFIG.ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voice_id)}/stream`;

  const voiceSettings = settings?.voice_settings || settings?.voiceSettings || undefined;
  const outputFormat = settings?.output_format || settings?.outputFormat || "mp3_44100_128";

  const body = {
    text,
    model_id: model_id || "eleven_multilingual_v2",
    ...(voiceSettings ? { voice_settings: voiceSettings } : {}),
    output_format: outputFormat,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": CONFIG.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await safeReadText(res);
    throw new Error(`ElevenLabs HTTP ${res.status}: ${errText}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("audio")) {
    const preview = await safeReadText(res);
    throw new Error(`ElevenLabs response not audio (content-type: ${ct}) :: ${preview}`);
  }

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (!buf.length) throw new Error("ElevenLabs returned empty audio buffer");

  return buf;
}

/** Upload mp3 → signed url */
async function uploadToStorage({ jobId, mp3Buffer }) {
  // bucket: voice, path: jobs/<id>.mp3
  const filePath = `jobs/${jobId}.mp3`;

  const { error: upErr } = await supabase.storage
    .from(CONFIG.VOICE_BUCKET)
    .upload(filePath, mp3Buffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (upErr) throw new Error(`Storage upload error: ${upErr.message}`);

  const { data: signed, error: signedErr } = await supabase.storage
    .from(CONFIG.VOICE_BUCKET)
    .createSignedUrl(filePath, CONFIG.VOICE_SIGNED_URL_TTL_SECONDS);

  if (signedErr) throw new Error(`Signed URL error: ${signedErr.message}`);
  if (!signed?.signedUrl) throw new Error("Signed URL missing");

  return { filePath, signedUrl: signed.signedUrl };
}

/** Claim oldest queued job */
async function claimNextJob() {
  const { data: jobs, error } = await supabase
    .from("voice_jobs")
    .select("id,status,text,voice_id,model_id,settings,retries,created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(`Supabase select error: ${error.message}`);
  if (!jobs?.length) return null;

  const job = jobs[0];
  const now = new Date().toISOString();

  const { data: claimed, error: claimErr } = await supabase
    .from("voice_jobs")
    .update({ status: "processing", started_at: now, updated_at: now })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id,status,text,voice_id,model_id,settings,retries,created_at")
    .single();

  if (claimErr) return null; // someone else claimed it
  return claimed || null;
}

async function markError(jobId, errMsg, retriesNext) {
  const now = new Date().toISOString();
  const final = retriesNext >= CONFIG.MAX_RETRIES;

  const { error } = await supabase
    .from("voice_jobs")
    .update({
      status: final ? "error" : "queued",
      error_message: String(errMsg || "").slice(0, 2000),
      retries: retriesNext,
      updated_at: now,
    })
    .eq("id", jobId);

  if (error) console.error("❌ Failed to update error:", error.message);
}

async function markDone(jobId, audioUrl, filePath) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("voice_jobs")
    .update({
      status: "done",
      audio_url: audioUrl,
      audio_path: filePath,
      error_message: null,
      updated_at: now,
      completed_at: now,
    })
    .eq("id", jobId);

  if (error) throw new Error(`Failed to mark done: ${error.message}`);
}

let running = true;
process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

async function runWithTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`Job timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log("✅ Voice Worker started");
  console.log(`• bucket: ${CONFIG.VOICE_BUCKET}`);
  console.log(`• poll: ${CONFIG.POLL_INTERVAL_MS}ms`);
  console.log(`• max_retries: ${CONFIG.MAX_RETRIES}`);

  while (running) {
    const job = await claimNextJob();

    if (!job) {
      await sleep(CONFIG.POLL_INTERVAL_MS);
      continue;
    }

    const jobId = job.id;

    try {
      const text = String(job.text || "").trim();
      const voiceId = String(job.voice_id || "").trim();
      const modelId = String(job.model_id || "").trim() || "eleven_multilingual_v2";
      const settings = job.settings || {};
      const retries = Number(job.retries || 0);

      if (!text) throw new Error("Job missing text");
      if (!voiceId) throw new Error("Job missing voice_id");

      console.log(`🎙️ Processing voice job ${jobId} (retry=${retries})`);

      await runWithTimeout(
        (async () => {
          const mp3 = await elevenLabsTTS({ text, voice_id: voiceId, model_id: modelId, settings });
          const { filePath, signedUrl } = await uploadToStorage({ jobId, mp3Buffer: mp3 });
          await markDone(jobId, signedUrl, filePath);
        })(),
        CONFIG.JOB_TIMEOUT_MS
      );

      console.log(`✅ Completed voice job ${jobId}`);
    } catch (err) {
      const msg = err?.message || String(err);
      console.error("❌ Voice job failed:", jobId, msg);

      const retriesNext = Number(job.retries || 0) + 1;
      await markError(jobId, msg, retriesNext);
    }

    await sleep(CONFIG.POLL_INTERVAL_MS);
  }

  console.log("🛑 Voice Worker stopped");
}

main().catch((e) => {
  console.error("❌ Fatal:", e?.message || String(e));
  process.exit(1);
});
