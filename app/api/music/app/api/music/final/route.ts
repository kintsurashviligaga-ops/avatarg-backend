import { NextRequest, NextResponse } from "next/server";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!ELEVENLABS_API_KEY) {
  throw new Error("Missing ELEVENLABS_API_KEY");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      duration_sec = 30,
      instrumental = false,
      model_id = "music_v1",
    } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const elevenRes = await fetch(
      "https://api.elevenlabs.io/v1/music/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          prompt,
          duration_sec,
          instrumental,
          model_id,
        }),
      }
    );

    if (!elevenRes.ok) {
      const err = await elevenRes.text();
      return NextResponse.json(
        { error: "ElevenLabs music generation failed", details: err },
        { status: 500 }
      );
    }

    const audioBuffer = await elevenRes.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": "inline; filename=avatar-g-final-song.mp3",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Unexpected server error", message: error.message },
      { status: 500 }
    );
  }
}
