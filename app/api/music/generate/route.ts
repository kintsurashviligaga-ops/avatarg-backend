import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // Buffer / binary support

// ---------------- Types ----------------
type GenerateBody = {
  mood?: string;
  genre?: string;
  language?: string;
  topic?: string;
  mustInclude?: string;
  prompt?: string; // userPrompt
  bpm?: number;
  voiceId?: string;
  responseMode?: "minimal" | "full"; // default: "full"
};

type MinimalOk = {
  ok: true;
  title: string;
  bpm: number;
  lyrics: string;
  voice: {
    provider: "elevenlabs";
    voiceId: string;
    url: string | null;
  };
};

type FullOk = {
  ok: true;
  title: string;
  bpm: number;
  lyrics: string;
  tts_text: string;
  voice: {
    provider: "elevenlabs";
    voiceId: string;
    url: string | null;
    storagePath: string | null;
    bytes: number;
    contentType: "audio/mpeg";
  };
  note: string;
};

type ErrResponse = {
  ok: false;
  error: string;
  code?: string;
};

// ---------------- Helpers ----------------
function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function corsHeaders(origin?: string) {
  const allowlist = (process.env.CORS_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let o = origin ?? "*";
  if (allowlist.length > 0) {
    o = origin && allowlist.includes(origin) ? origin : allowlist[0];
  }

  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

async function safeReadText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function safeFileName(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function nowStamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function normalizeBody(raw: any): Required<
  Pick<GenerateBody, "mood" | "genre" | "language" | "topic" | "mustInclude">
> &
  Pick<GenerateBody, "prompt" | "bpm" | "voiceId" | "responseMode"> {
  const mood =
    typeof raw?.mood === "string" && raw.mood.trim() ? raw.mood.trim() : "Happy / festive";
  const genre = typeof raw?.genre === "string" && raw.genre.trim() ? raw.genre.trim() : "Pop";
  const language =
    typeof raw?.language === "string" && raw.language.trim() ? raw.language.trim() : "English";
  const topic =
    typeof raw?.topic === "string" && raw.topic.trim()
      ? raw.topic.trim()
      : "Avatar G platform promo";
  const mustInclude =
    typeof raw?.mustInclude === "string" && raw.mustInclude.trim() ? raw.mustInclude.trim() : "";

  const prompt = typeof raw?.prompt === "string" && raw.prompt.trim() ? raw.prompt.trim() : undefined;

  const bpm = typeof raw?.bpm === "number" && Number.isFinite(raw.bpm) ? raw.bpm : undefined;

  const voiceId = typeof raw?.voiceId === "string" && raw.voiceId.trim() ? raw.voiceId.trim() : undefined;

  const responseMode =
    raw?.responseMode === "minimal" || raw?.responseMode === "full" ? raw.responseMode : "full";

  return { mood, genre, language, topic, mustInclude, prompt, bpm, voiceId, responseMode };
}

// If your UI accidentally receives JSON string (like full API response), extract only the lyrics content.
function extractLyricsText(maybeLyrics: string) {
  const s = String(maybeLyrics ?? "").trim();

  // If it's already clean lyrics, return as-is
  if (!s.startsWith("{") && !s.includes('"choices"') && !s.includes('"usage"')) return s;

  // Try parse and extract common OpenAI-like envelopes
  try {
    const obj = JSON.parse(s);

    // Our intended format: { title, bpm, lyrics }
    if (typeof obj?.lyrics === "string" && obj.lyrics.trim()) return obj.lyrics.trim();

    // OpenAI-ish: { choices:[{ message:{ content:"..." } }] }
    const content = obj?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      // If content itself is JSON, try parse again
      const inner = tryParseJsonObject(content);
      if (inner?.lyrics && typeof inner.lyrics === "string") return inner.lyrics.trim();
      return content.trim();
    }
  } catch {
    // ignore
  }

  return s;
}

// -------- ElevenLabs (timeout) --------
async function elevenLabsTTS({
  apiKey,
  voiceId,
  text,
  modelId,
  timeoutMs = 45000,
}: {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId?: string;
  timeoutMs?: number;
}) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    voiceId
  )}/stream?output_format=mp3_44100_128`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
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
      const msg = await safeReadText(res);
      throw new Error(`ElevenLabs TTS failed: ${res.status} ${msg}`.trim());
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`ElevenLabs TTS timeout after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function buildSingableText(lyrics: string) {
  const cleaned = String(lyrics || "")
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .trim();

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
    .slice(0, 1100);
}

// -------- OpenAI --------
function tryParseJsonObject(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sub = s.slice(start, end + 1);
      try {
        return JSON.parse(sub);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateLyricsWithOpenAI(input: {
  mood: string;
  genre: string;
  language: string;
  topic: string;
  mustInclude: string;
  userPrompt?: string;
  bpm?: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });
  const bpm = typeof input.bpm === "number" && Number.isFinite(input.bpm) ? input.bpm : 120;

  const basePrompt = `
Write a SHORT-to-MEDIUM, catchy, modern advertising song lyric for:
- Mood: ${input.mood}
- Genre: ${input.genre}
- Language: ${input.language}
- Tempo: ~${bpm} BPM
- Topic: ${input.topic}

Must include (if any): ${input.mustInclude || "(none)"}

Rules:
- Clean and brand-safe (no explicit content).
- Strong, memorable chorus.
- Simple words, easy to sing.
- Clear CTA about Avatar G (AI media factory for business).
Return JSON ONLY with keys: "title", "bpm", "lyrics".
Where "lyrics" contains labeled sections:
Verse 1, Chorus, Verse 2, Bridge, Chorus, Outro.
`.trim();

  const userContent = input.userPrompt ? `${basePrompt}\nUser prompt: ${input.userPrompt}` : basePrompt;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.8,
    max_tokens: 700,
    messages: [
      {
        role: "system",
        content:
          "You are a professional songwriter for brand-safe advertising music. Output strictly as JSON object only. No extra text.",
      },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" } as any,
  });

  const raw = completion.choices?.[0]?.message?.content ?? "{}";
  const parsed = tryParseJsonObject(raw) ?? { title: "Avatar G Anthem", bpm, lyrics: raw };

  const title = String(parsed.title ?? "Avatar G Anthem").slice(0, 80);
  const outBpm = Number(parsed.bpm ?? bpm);
  const lyricsRaw = String(parsed.lyrics ?? "").trim();
  const lyrics = extractLyricsText(lyricsRaw); // ✅ important: removes accidental JSON envelopes

  if (!lyrics) throw new Error("OpenAI returned empty lyrics");

  return { title, bpm: Number.isFinite(outBpm) ? outBpm : bpm, lyrics };
}

// -------- Supabase --------
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ---------------- Routes ----------------
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";

  try {
    const rawBody = await req.json().catch(() => ({}));
    const body = normalizeBody(rawBody);

    // 1) Lyrics
    const { title, lyrics, bpm } = await generateLyricsWithOpenAI({
      mood: body.mood,
      genre: body.genre,
      language: body.language,
      topic: body.topic,
      mustInclude: body.mustInclude,
      userPrompt: body.prompt,
      bpm: body.bpm,
    });

    // 2) ElevenLabs MP3
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenKey) throw new Error("Missing ELEVENLABS_API_KEY");

    const defaultVoiceId = process.env.ELEVENLABS_VOICE_ID;
    const selectedVoiceId = (body.voiceId && String(body.voiceId)) || defaultVoiceId;
    if (!selectedVoiceId) throw new Error("Missing ELEVENLABS_VOICE_ID (or pass voiceId)");

    const ttsText = buildSingableText(lyrics);

    const vocalMp3 = await elevenLabsTTS({
      apiKey: elevenKey,
      voiceId: selectedVoiceId,
      text: ttsText,
      modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
      timeoutMs: 45000,
    });

    // 3) Upload to Supabase (optional)
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "music";
    const supabase = getSupabaseAdmin();

    let vocalUrl: string | null = null;
    let storagePath: string | null = null;

    if (supabase) {
      const base = safeFileName(`${title}-${body.language}-${body.genre}-${nowStamp()}`);
      storagePath = `generated/${base}.mp3`;

      const up = await supabase.storage.from(bucket).upload(storagePath, vocalMp3, {
        contentType: "audio/mpeg",
        upsert: true,
        cacheControl: "3600",
      });

      if (up.error) throw new Error(`Supabase upload failed: ${up.error.message}`);

      const pub = supabase.storage.from(bucket).getPublicUrl(storagePath);
      vocalUrl = pub.data.publicUrl ?? null;
    }

    const note = supabase
      ? "Vocal MP3 generated and uploaded to Supabase Storage."
      : "Vocal MP3 generated but Supabase env missing; set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_STORAGE_BUCKET.";

    // ✅ Minimal vs Full response
    if (body.responseMode === "minimal") {
      const minimal: MinimalOk = {
        ok: true,
        title,
        bpm,
        lyrics,
        voice: { provider: "elevenlabs", voiceId: selectedVoiceId, url: vocalUrl },
      };
      return json(minimal, 200, corsHeaders(origin));
    }

    const full: FullOk = {
      ok: true,
      title,
      bpm,
      lyrics,
      tts_text: ttsText,
      voice: {
        provider: "elevenlabs",
        voiceId: selectedVoiceId,
        url: vocalUrl,
        storagePath,
        bytes: vocalMp3.length,
        contentType: "audio/mpeg",
      },
      note,
    };

    return json(full, 200, corsHeaders(origin));
  } catch (err: any) {
    console.error("❌ /api/music/generate ERROR", err);

    const message = String(err?.message ?? err);
    const payload: ErrResponse = {
      ok: false,
      error: message,
      code: message.toLowerCase().includes("timeout") ? "TTS_TIMEOUT" : "GENERIC_ERROR",
    };

    return json(payload, 500, corsHeaders(origin));
  }
            }
