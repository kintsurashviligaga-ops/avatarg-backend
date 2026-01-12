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
Write a catchy song lyrics.
Mood: ${mood}
Genre: ${genre}
Language: ${language}
Topic: ${topic}

Include:
- Verse
- Chorus
- Bridge
- Outro
Make it modern, brand-safe, and easy to sing.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional songwriter." },
        { role: "user", content: prompt },
      ],
    });

    return NextResponse.json({
      success: true,
      lyrics: completion.choices[0].message.content,
    });
  } catch (error: any) {
    console.error("Music generate error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
