import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      mood = "happy",
      genre = "pop",
      language = "English",
      topic = "Avatar G promo",
    } = body;

    const prompt = `
Write catchy, brand-safe song lyrics.

Mood: ${mood}
Genre: ${genre}
Language: ${language}
Topic: ${topic}

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
      success: true,
      lyrics,
    });
  } catch (error: any) {
    console.error("Lyrics generate error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate lyrics",
      },
      { status: 500 }
    );
  }
}
