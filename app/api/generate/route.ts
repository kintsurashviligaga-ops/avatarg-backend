import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  mood?: string;
  genre?: string;
  language?: string;
  topic?: string;
  bpm?: number;
};

function clean(v: unknown, fallback: string) {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function cleanBpm(v: unknown, fallback = 120) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(180, Math.max(60, Math.round(n)));
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const raw: Body = await req.json().catch(() => ({}));

    const mood = clean(raw.mood, "Happy / festive");
    const genre = clean(raw.genre, "Pop");
    const language = clean(raw.language, "English");
    const topic = clean(raw.topic, "Avatar G promo");
    const bpm = cleanBpm(raw.bpm);

    const prompt = `
Write SHORT-to-MEDIUM, catchy, modern advertising song lyrics.

Mood: ${mood}
Genre: ${genre}
Language: ${language}
Tempo: ~${bpm} BPM
Topic: ${topic}

Structure (use labels exactly):
Verse 1:
Chorus:
Verse 2:
Bridge:
Final Chorus / Outro:

Rules:
- Brand-safe, no explicit content
- Strong, memorable chorus
- Easy to sing
- Clear CTA for Avatar G
- Output ONLY the lyrics with labels
`.trim();

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 650,
      messages: [
        {
          role: "system",
          content:
            "You are a professional songwriter for brand-safe advertising music.",
        },
        { role: "user", content: prompt },
      ],
    });

    const lyrics = completion.choices?.[0]?.message?.content?.trim();

    if (!lyrics) {
      return NextResponse.json(
        { success: false, error: "Empty lyrics from OpenAI" },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        mood,
        genre,
        language,
        topic,
        bpm,
        lyrics,
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (err: any) {
    console.error("❌ /api/music/generate error:", err);

    return NextResponse.json(
      {
        success: false,
        error: String(err?.message ?? "Internal error"),
      },
      { status: 500 }
    );
  }
}
