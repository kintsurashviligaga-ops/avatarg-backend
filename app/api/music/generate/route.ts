import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // required for Buffer / binary

// ---------------- Helpers ----------------
function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin?: string) {
  // If you want to lock this down later:
  // const allow = (process.env.CORS_ALLOWLIST ?? "").split(",").map(s => s.trim()).filter(Boolean);
  // const o = origin && allow.includes(origin) ? origin : allow[0] ?? "*";
  const o = origin ?? "*";

  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
  };
}

function safeFileName(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function elevenLabsTTS({
  apiKey,
  voiceId,
  text,
  modelId,
}: {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId?: string;
}) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    voiceId
  )}/stream?output_format=mp3_44100_128`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId ?? "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${msg}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildSingableText(lyrics: string) {
  const cleaned = String(lyrics || "")
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .trim();

  // pick chorus + verse1 if exists
  const chorusMatch = cleaned.match(/(chorus[:\s].*?)(\n\n|$)/is);
  const verseMatch = cleaned.match(/(verse\s*1[:\s].*?)(\n\n|$)/is);

  const parts: string[] = [];
  if (chorusMatch?.[1]) parts.push(chorusMatch[1]);
  if (verseMatch?.[1]) parts.push(verseMatch[1]);

  const text = parts.length > 0 ? parts.join("\n\n") : cleaned.slice(0, 900);

  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[.]/g, ". ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1100); // protect from too long TTS
}

async function generateLyricsWithOpenAI(input: {
  mood?: string;
  genre?: string;
  language?: string;
  topic?: string;
  mustInclude?: string;
  userPrompt?: string;
  bpm?: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });

  const mood = input.mood ?? "Happy / festive";
  const genre = input.genre ?? "Pop";
  const language = input.language ?? "English";
  const topic = input.topic ?? "Avatar G platform promo";
  const mustInclude = input.mustInclude ?? "";
  const bpm = input.bpm ?? 120;

  const prompt = `
Write a SHORT-to-MEDIUM, catchy, modern song lyric for:
- Mood: ${mood}
- Genre: ${genre}
- Language: ${language}
- Tempo: ~${bpm} BPM
- Topic: ${topic}

Must include (if any): ${mustInclude || "(none)"}

Rules:
- Clean and brand-safe (no explicit content).
- Strong, memorable chorus.
- Simple words, easy to sing.
- Clear CTA about Avatar G (AI media factory for business).
Return JSON ONLY with keys: "title", "bpm", "lyrics".
Where "lyrics" contains labeled sections:
Verse 1, Chorus, Verse 2, Bridge, Chorus, Outro.
`.trim();

  // Try strict JSON mode; fallback if library/model ever fails
  let raw = "";
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: "You are a professional songwriter for brand-safe advertising music.",
        },
        {
          role: "user",
          content: input.userPrompt ? `${prompt}\nUser prompt: ${input.userPrompt}` : prompt,
        },
      ],
      response_format: { type: "json_object" } as any,
    });

    raw = completion.choices?.[0]?.message?.content ?? "{}";
  } catch (e) {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "Return a JSON object with keys title, bpm, lyrics (with Verse/Chorus/Bridge labels). No extra text.",
        },
        {
          role: "user",
          content: input.userPrompt ? `${prompt}\nUser prompt: ${input.userPrompt}` : prompt,
        },
      ],
    });

    raw = completion.choices?.[0]?.message?.content ?? "{}";
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { title: "Avatar G Anthem", bpm, lyrics: raw };
  }

  const title = String(parsed.title ?? "Avatar G Anthem").slice(0, 80);
  const outBpm = Number(parsed.bpm ?? bpm);
  const lyrics = String(parsed.lyrics ?? "").trim();

  if (!lyrics) throw new Error("OpenAI returned empty lyrics");

  return { title, bpm: outBpm, lyrics };
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function nowStamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ---------------- Routes ----------------
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";

  try {
    const body = await req.json().catch(() => ({}));

    const {
      mood,
      genre,
      language,
      topic,
      mustInclude,
      prompt: userPrompt,
      bpm,
      voiceId,
    } = body ?? {};

    // 1) Lyrics
    const { title, lyrics, bpm: outBpm } = await generateLyricsWithOpenAI({
      mood,
      genre,
      language,
      topic,
      mustInclude,
      userPrompt,
      bpm: typeof bpm === "number" ? bpm : undefined,
    });

    // 2) ElevenLabs MP3
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenKey) throw new Error("Missing ELEVENLABS_API_KEY");

    const defaultVoiceId = process.env.ELEVENLABS_VOICE_ID;
    const selectedVoiceId = (voiceId && String(voiceId)) || defaultVoiceId;
    if (!selectedVoiceId) throw new Error("Missing ELEVENLABS_VOICE_ID (or pass voiceId)");

    const ttsText = buildSingableText(lyrics);
    const vocalMp3 = await elevenLabsTTS({
      apiKey: elevenKey,
      voiceId: selectedVoiceId,
      text: ttsText,
      modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
    });

    // 3) Upload to Supabase (optional but recommended)
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "music";
    const supabase = getSupabaseAdmin();

    let vocalUrl: string | null = null;
    let storagePath: string | null = null;

    if (supabase) {
      const base = safeFileName(`${title}-${language || "en"}-${genre || "pop"}-${nowStamp()}`);
      storagePath = `generated/${base}.mp3`;

      const up = await supabase.storage.from(bucket).upload(storagePath, vocalMp3, {
        contentType: "audio/mpeg",
        upsert: true,
      });

      if (up.error) throw new Error(`Supabase upload failed: ${up.error.message}`);

      const pub = supabase.storage.from(bucket).getPublicUrl(storagePath);
      vocalUrl = pub.data.publicUrl ?? null;
    }

    return json(
      {
        ok: true,
        title,
        bpm: outBpm,
        lyrics, // full lyrics (for Suno-ready UI)
        tts_text: ttsText, // what we used for ElevenLabs
        voice: {
          provider: "elevenlabs",
          voiceId: selectedVoiceId,
          url: vocalUrl, // null if supabase not configured
          storagePath,
          bytes: vocalMp3.length,
          contentType: "audio/mpeg",
        },
        note: supabase
          ? "Vocal MP3 generated and uploaded to Supabase Storage."
          : "Vocal MP3 generated but Supabase env missing; set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_STORAGE_BUCKET.",
      },
      200,
      corsHeaders(origin)
    );
  } catch (err: any) {
    console.error("❌ /api/music/generate ERROR", err);

    return json(
      {
        ok: false,
        error: String(err?.message ?? err),
      },
      500,
      corsHeaders(origin)
    );
  }
}
