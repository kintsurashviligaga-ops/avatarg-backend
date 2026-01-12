import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const mood = body.mood || "Happy / festive";
    const genre = body.genre || "Pop";
    const language = body.language || "English";
    const topic = body.topic || "Avatar G promo";
    const bpm = Number(body.bpm) || 120;

    const prompt = `
Write catchy, brand-safe advertising song lyrics.

Mood: ${mood}
Genre: ${genre}
Language: ${language}
Tempo: ~${bpm} BPM
Topic: ${topic}

Structure:
Verse 1:
Chorus:
Verse 2:
Bridge:
Final Chorus / Outro:

Rules:
- Clean, modern, easy to sing
- Strong memorable chorus
- No explicit content
- Clear CTA for Avatar G
`.trim();

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 650,
      messages: [
        { role: "system", content: "You are a professional songwriter." },
        { role: "user", content: prompt },
      ],
    });

    const lyrics = completion.choices?.[0]?.message?.content?.trim();

    if (!lyrics) {
      return NextResponse.json(
        { success: false, error: "No lyrics generated" },
        { status: 500 }
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
      { status: 200 }
    );
  } catch (err: any) {
    console.error("API ERROR:", err);

    return NextResponse.json(
      { success: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
