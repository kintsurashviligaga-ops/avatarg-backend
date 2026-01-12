import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const mood = body.mood || "Happy / festive";
    const genre = body.genre || "Pop";
    const language = body.language || "English";
    const topic = body.topic || "Avatar G promo";
    const bpm = Number(body.bpm) || 120;
    const mustInclude = body.mustInclude || "";

    const prompt = `
Write catchy, brand-safe advertising song lyrics.

Mood: ${mood}
Genre: ${genre}
Language: ${language}
Tempo: ~${bpm} BPM
Topic: ${topic}
Must include: ${mustInclude}

Structure:
- Verse 1
- Chorus
- Verse 2
- Chorus
- Bridge
- Final Chorus / Outro

Rules:
- Modern, upbeat, easy to sing
- No explicit content
- Clear memorable chorus
- Suitable for AI vocal generation
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional songwriter." },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
    });

    const lyrics = completion.choices[0]?.message?.content ?? "";

    return NextResponse.json({
      ok: true,
      title: `${topic} (${genre})`,
      bpm,
      lyrics,
      voice: {
        provider: "elevenlabs",
        voiceId: "default",
        url: null,
      },
      note: "Lyrics generated successfully",
    });
  } catch (error) {
    console.error("Music generate error:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to generate music lyrics" },
      { status: 500 }
    );
  }
}
