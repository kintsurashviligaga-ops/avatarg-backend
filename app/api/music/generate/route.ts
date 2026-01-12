import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiOk = {
  ok: true;
  title: string;
  bpm: number;
  lyrics: string;
  voice: {
    provider: "elevenlabs";
    voiceId: string | null;
    url: string | null;
  };
};

type ApiErr = {
  ok: false;
  error: string;
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({} as any));

    const mood = typeof body?.mood === "string" ? body.mood : "Happy / festive";
    const genre = typeof body?.genre === "string" ? body.genre : "Pop";
    const language = typeof body?.language === "string" ? body.language : "English";
    const topic = typeof body?.topic === "string" ? body.topic : "Avatar G promo";
    const bpm = Number.isFinite(Number(body?.bpm)) ? Number(body.bpm) : 120;

    const prompt = `
Write catchy, brand-safe advertising song lyrics.

Mood: ${mood}
Genre: ${genre}
Language: ${language}
Tempo: ~${bpm} BPM
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
`.trim();

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 700,
      messages: [
        { role: "system", content: "You are a professional songwriter. Return lyrics only." },
        { role: "user", content: prompt },
      ],
    });

    const lyrics = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!lyrics) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: "OpenAI returned empty lyrics" },
        { status: 502 }
      );
    }

    const out: ApiOk = {
      ok: true,
      title: "Avatar G Song",
      bpm,
      lyrics,
      // ამ endpoint-ში ჯერ მხოლოდ ლირიკებს ვაბრუნებთ
      // (შენ UI-ში უკვე სწორად იყენებ url-ს)
      voice: { provider: "elevenlabs", voiceId: null, url: null },
    };

    return NextResponse.json(out);
  } catch (err: any) {
    console.error("❌ /api/music/generate error:", err);
    return NextResponse.json<ApiErr>(
      { ok: false, error: err?.message ?? "Failed to generate lyrics" },
      { status: 500 }
    );
  }
}
