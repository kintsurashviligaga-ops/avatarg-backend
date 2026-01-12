import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // important for binary/audio buffers

// ---------- Helpers ----------
function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new NextResponse(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin?: string) {
  // You can tighten this later with an allowlist
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
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
  // MP3 stream endpoint (stable)
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
  // ElevenLabs TTS is not a singing engine; we still format it “music-friendly”
  // so it sounds like a promo-chant/vox over a beat.
  // Keep it short to avoid extremely long TTS.
  const cleaned = lyrics
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .trim();

  // Take chorus + 1 verse if present, otherwise first ~900 chars
  const chorusMatch = cleaned.match(/(chorus[:\s].*?)(\n\n|$)/is);
  const verseMatch = cleaned.match(/(verse\s*1[:\s].*?)(\n\n|$)/is);

  const parts: string[] = [];
  if (chorusMatch?.[1]) parts.push(chorusMatch[1]);
  if (verseMatch?.[1]) parts.push(verseMatch[1]);

  const text =
    parts.length > 0 ? parts.join("\n\n") : cleaned.slice(0, 900);

  // Add “breathing / spacing” for better cadence
  return text
    .replace(/\n+/g, "\n")
    .replace(/[,;]/g, ", ")
    .replace(/[.]/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
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
- Keep it clean and brand-safe (no explicit content).
- Make a strong, memorable chorus.
- Use simple words, easy to sing.
- Include CTA about Avatar G (create content fast, AI media factory, business promo).
Return JSON ONLY with keys:
"title", "bpm", "lyrics"
Where "lyrics" contains labeled sections: Verse 1, Chorus, Verse 2, Bridge, Chorus, Outro.
`;

  // Using Chat Completions for compatibility
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.8,
    messages: [
      { role: "system", content: "You are a professional songwriter for brand-safe advertising music." },
      { role: "user", content: input.userPrompt ? `${prompt}\nUser prompt: ${input.userPrompt}` : prompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { title: "Avatar G Anthem", bpm, lyrics: raw };
  }

  return {
    title: String(parsed.title ?? "Avatar G Anthem"),
    bpm: Number(parsed.bpm ?? bpm),
    lyrics: String(parsed.lyrics ?? ""),
  };
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

// ---------- Routes ----------
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
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
      voiceId, // optional override
    } = body ?? {};

    // 1) Generate lyrics
    const { title, lyrics, bpm: outBpm } = await generateLyricsWithOpenAI({
      mood,
      genre,
      language,
      topic,
      mustInclude,
      userPrompt,
      bpm: typeof bpm === "number" ? bpm : undefined,
    });

    // 2) Create vocal audio via ElevenLabs
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenKey) throw new Error("Missing ELEVENLABS_API_KEY");

    const defaultVoiceId = process.env.ELEVENLABS_VOICE_ID;
    const selectedVoiceId = (voiceId && String(voiceId)) || defaultVoiceId;
    if (!selectedVoiceId) throw new Error("Missing ELEVENLABS_VOICE_ID (or pass voiceId in body)");

    const ttsText = buildSingableText(lyrics);
    const vocalMp3 = await elevenLabsTTS({
      apiKey: elevenKey,
      voiceId: selectedVoiceId,
      text: ttsText,
      modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
    });

    // 3) Upload to Supabase Storage (recommended)
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "music";
    const supabase = getSupabaseAdmin();

    let vocalUrl: string | null = null;
    let storagePath: string | null = null;

    if (supabase) {
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
        now.getDate()
      ).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(
        2,
        "0"
      )}${String(now.getSeconds()).padStart(2, "0")}`;

      const base = safeFileName(`${title}-${language}-${genre}-${stamp}`);
      storagePath = `generated/${base}.mp3`;

      const up = await supabase.storage.from(bucket).upload(storagePath, vocalMp3, {
        contentType: "audio/mpeg",
        upsert: true,
      });

      if (up.error) throw new Error(`Supabase upload failed: ${up.error.message}`);

      const pub = supabase.storage.from(bucket).getPublicUrl(storagePath);
      vocalUrl = pub.data.publicUrl ?? null;
    } else {
      // fallback: return base64 (NOT ideal), but prevents total failure if env missing
      vocalUrl = null;
    }

    return json(
      {
        ok: true,
        title,
        bpm: outBpm,
        lyrics,
        voice: {
          provider: "elevenlabs",
          voiceId: selectedVoiceId,
          url: vocalUrl,
          storagePath,
          bytes: vocalMp3.length,
        },
        note:
          supabase
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
