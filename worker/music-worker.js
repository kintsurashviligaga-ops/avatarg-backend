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
 *   VOICE_BUCKET="voice"                  (Supabase Storage bucket)
 *   VOICE_SIGNED_URL_TTL_SECONDS="604800" (7 days)
 *   POLL_INTERVAL_MS="1500"
 *   CLAIM_TIMEOUT_MS="90000"
 *   MAX_RETRIES="3"
 *
 * Table expected (minimal):
 *   voice_jobs: id, status, text, voice_id, model_id, settings(jsonb), audio_url, error, created_at, updated_at
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
  CLAIM_TIMEOUT_MS: parseInt(process.env.CLAIM_TIMEOUT_MS || "90000", 10),
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

/**
 * Calls ElevenLabs TTS and returns MP3 buffer.
 */
async function elevenLabsTTS({ text, voice_id, model_id, settings }) {
  const url = `${CONFIG.ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(
    voice_id
  )}/stream`;

  // job.settings can override voice_settings, output_format, etc.
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

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("audio")) {
    const preview = await safeReadText(res);
    throw new Error(`ElevenLabs response missing audio (content-type: ${contentType}) :: ${preview}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  if (!buf.length) throw new Error("ElevenLabs returned empty audio buffer");

  return buf;
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "(failed to read body)";
  }
}

/**
 * Upload MP3 to Supabase Storage bucket and return signed URL.
 */
async function uploadToStorage({ jobId, mp3Buffer }) {
  const filePath = `voice/${jobId}.mp3`;

  // Upload (upsert true so retries overwrite)
  const { error: upErr } = await supabase.storage
    .from(CONFIG.VOICE_BUCKET)
    .upload(filePath, mp3Buffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (upErr) throw new Error(`Storage upload error: ${upErr.message}`);

  // Signed URL (works even for private bucket)
  const { data: signed, error: signedErr } = await supabase.storage
    .from(CONFIG.VOICE_BUCKET)
    .createSignedUrl(filePath, CONFIG.VOICE_SIGNED_URL_TTL_SECONDS);

  if (signedErr) throw new Error(`Signed URL error: ${signedErr.message}`);

  return { filePath, signedUrl: signed?.signedUrl || null };
}

/**
 * Claims one queued job atomically-ish:
 * - Fetch oldest queued
 * - Try to update it to processing only if still queued
 */
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
    .update({
      status: "processing",
      started_at: now,
      updated_at: now,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id,status,text,voice_id,model_id,settings,retries,created_at")
    .single();

  if (claimErr) {
    // If another worker grabbed it, ignore
    return null;
  }

  return claimed || null;
}

async function markError(jobId, errMsg, retriesNext) {
  const now = new Date().toISOString();
  const status = retriesNext >= CONFIG.MAX_RETRIES ? "error" : "queued";
  const { error } = await supabase
    .from("voice_jobs")
    .update({
      status,
      error: errMsg,
      retries: retriesNext,
      updated_at: now,
      error_at: now,
    })
    .eq("id", jobId);

  if (error) console.error("❌ Failed to update error status:", error.message);
}

async function markDone(jobId, audioUrl, filePath) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("voice_jobs")
    .update({
      status: "completed",
      audio_url: audioUrl,
      audio_path: filePath,
      error: null,
      updated_at: now,
      completed_at: now,
    })
    .eq("id", jobId);

  if (error) throw new Error(`Failed to mark completed: ${error.message}`);
}

let running = true;
process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

async function main() {
  console.log("✅ Voice Worker started");
  console.log(`• bucket: ${CONFIG.VOICE_BUCKET}`);
  console.log(`• poll: ${CONFIG.POLL_INTERVAL_MS}ms`);
  console.log(`• max_retries: ${CONFIG.MAX_RETRIES}`);

  while (running) {
    try {
      const job = await claimNextJob();

      if (!job) {
        await sleep(CONFIG.POLL_INTERVAL_MS);
        continue;
      }

      const jobId = job.id;
      const text = String(job.text || "").trim();
      const voiceId = String(job.voice_id || "").trim();
      const modelId = String(job.model_id || "").trim() || "eleven_multilingual_v2";
      const settings = job.settings || {};
      const retries = Number(job.retries || 0);

      if (!text) throw new Error("Job missing text");
      if (!voiceId) throw new Error("Job missing voice_id");

      console.log(`🎙️ Processing voice job ${jobId} (retry=${retries})`);

      // Safety timeout per job
      const timeoutPromise = new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`Job timeout after ${CONFIG.CLAIM_TIMEOUT_MS}ms`)), CONFIG.CLAIM_TIMEOUT_MS)
      );

      const workPromise = (async () => {
        const mp3 = await elevenLabsTTS({
          text,
          voice_id: voiceId,
          model_id: modelId,
          settings,
        });

        const { filePath, signedUrl } = await uploadToStorage({ jobId, mp3Buffer: mp3 });
        if (!signedUrl) throw new Error("Failed to generate signed URL");

        await markDone(jobId, signedUrl, filePath);
        console.log(`✅ Completed voice job ${jobId}`);
      })();

      await Promise.race([workPromise, timeoutPromise]);
    } catch (err) {
      const msg = err?.message || String(err);
      console.error("❌ VOICE WORKER ERROR:", msg);

      // If we can detect jobId from logs? Not safe. Best effort:
      // We'll attempt to locate the latest processing job older than 2 minutes without completed_at.
      try {
        const { data: stuck, error } = await supabase
          .from("voice_jobs")
          .select("id,retries,updated_at")
          .eq("status", "processing")
          .order("updated_at", { ascending: true })
          .limit(1);

        if (!error && stuck?.length) {
          const job = stuck[0];
          const retriesNext = Number(job.retries || 0) + 1;
          await markError(job.id, msg, retriesNext);
        }
      } catch (e2) {
        console.error("❌ Failed to mark error for processing job:", e2?.message || String(e2));
      }

      await sleep(CONFIG.POLL_INTERVAL_MS);
    }
  }

  console.log("🛑 Voice Worker stopped");
}

main().catch((e) => {
  console.error("❌ Fatal:", e?.message || String(e));
  process.exit(1);
});
