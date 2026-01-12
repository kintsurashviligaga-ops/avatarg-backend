import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoid caching on Vercel

type Body = {
  mood?: string;
  genre?: string;
  language?: string;
  topic?: string;
  mustInclude?: string;
  bpm?: number;
};

function cleanStr(v: unknown, fallback: string, max = 120) {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  return s ? s.slice(0, max) : fallback;
}

function cleanBpm(v: unknown, fallback = 120) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  // keep in a sensible range
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

    const raw: Body = await req.json().catch(() => ({} as Body));

    const mood = cleanStr(raw.mood, "Happy / festive", 60);
    const genre = cleanStr(raw.genre, "Pop", 60);
    const language = cleanStr(raw.language, "English", 40);
    const topic = cleanStr(raw.topic, "Avatar G promo", 120);
    const mustInclude = cleanStr(raw.mustInclude, "", 160);
    const bpm = cleanBpm(raw.bpm, 120);

    const prompt = `
Write SHORT-to-MEDIUM, catchy, modern advertising song lyrics.

Mood: ${mood}
Genre: ${genre}
Language: ${language}
Tempo: ~${bpm} BPM
Topic: ${topic}
Must include (optional): ${mustInclude || "(none)"}

Structure (use labels exactly):
Verse 1:
Chorus:
Verse 2:
Bridge:
Final Chorus / Outro:

Rules:
- Brand-safe, no explicit content.
- Strong, memorable chorus with a clear CTA for Avatar G.
- Simple words, easy to sing.
- Avoid extra explanations. Output ONLY the lyrics with the section labels.
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 650,
      messages: [
        {
          role: "system",
          content:
            "You are a professional songwriter for brand-safe advertising music. Output only lyrics with section labels.",
        },
        { role: "user", content: prompt },
      ],
    });

    const lyrics = (completion.choices?.[0]?.message?.content ?? "").trim();

    if (!lyrics) {
      return NextResponse.json(
        { success: false, error: "OpenAI returned empty lyrics" },
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
  } catch (error: any) {
    console.error("Lyrics generate error:", error);

    return NextResponse.json(
      {
        success: false,
        error: String(error?.message ?? "Failed to generate lyrics"),
      },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
```0
