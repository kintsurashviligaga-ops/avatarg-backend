import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  mood?: string;
  genre?: string;
  language?: string;
  topic?: string;
  mustInclude?: string;
  bpm?: number;
};

function pickStr(v: unknown, fallback: string) {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function pickNum(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function tryParseJsonObject(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return safeJson({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);
    }

    const bodyRaw = (await req.json().catch(() => ({}))) as Body;

    const mood = pickStr(bodyRaw.mood, "Happy / festive");
    const genre = pickStr(bodyRaw.genre, "Pop");
    const language = pickStr(bodyRaw.language, "English");
    const topic = pickStr(bodyRaw.topic, "Avatar G platform promo");
    const mustInclude = pickStr(bodyRaw.mustInclude, "");
    const bpm = pickNum(bodyRaw.bpm, 120);

    const prompt = `
Write a SHORT-to-MEDIUM, catchy, brand-safe advertising song lyric.

Mood: ${mood}
Genre: ${genre}
Language: ${language}
Tempo: ~${bpm} BPM
Topic: ${topic}
Must include: ${mustInclude || "(none)"}

Rules:
- No explicit content, clean & brand-safe.
- Strong, memorable chorus.
- Simple words, easy to sing.
- Clear CTA about Avatar G (AI media factory for business).

Return JSON ONLY with keys: "title", "bpm", "lyrics".
Lyrics must include labeled sections:
Verse 1, Chorus, Verse 2, Bridge, Chorus, Outro.
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 750,
      messages: [
        {
          role: "system",
          content:
            "You are a professional songwriter for brand-safe advertising music. Output strictly as a JSON object only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" } as any,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = tryParseJsonObject(raw);

    const title = String(parsed?.title ?? "Avatar G Anthem").slice(0, 80);
    const outBpm = pickNum(parsed?.bpm, bpm);
    const lyrics = String(parsed?.lyrics ?? "").trim();

    if (!lyrics) {
      return safeJson({ ok: false, error: "OpenAI returned empty lyrics" }, 500);
    }

    return safeJson({ ok: true, title, bpm: outBpm, lyrics }, 200);
  } catch (err: any) {
    console.error("❌ /api/music/generate error:", err);
    return safeJson(
      { ok: false, error: String(err?.message ?? err ?? "Unknown error") },
      500
    );
  }
                         }
