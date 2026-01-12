import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// ================= ENV =================
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_ENDPOINT =
  process.env.ELEVENLABS_ENDPOINT || "https://api.elevenlabs.io/v1/text-to-speech";

// გამოიყენე ერთიანი სახელი ENV-ში: ELEVENLABS_VOICE_ID
// მაგრამ backward-compatibility დავტოვე: ELEVENLABS_VOICE ან ELEVENLABS_VOICE_ID
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE || "";

const ELEVEN_MODEL_ID = "eleven_multilingual_v2";

// ================= POST =================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    // UI-სთან რომ არ დაგეჯახოს:
    // მივიღებთ ან body.text ან body.prompt
    const text: string =
      (typeof body?.text === "string" ? body.text : "") ||
      (typeof body?.prompt === "string" ? body.prompt : "");

    if (!text.trim()) {
      return NextResponse.json(
        { ok: false, error: "Text is required (send { text } or { prompt })" },
        { status: 400 }
      );
    }

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return NextResponse.json(
        {
          ok: false,
          error: "ElevenLabs env vars missing",
          missing: {
            ELEVENLABS_API_KEY: !ELEVENLABS_API_KEY,
            ELEVENLABS_VOICE_ID: !ELEVENLABS_VOICE_ID,
          },
        },
        { status: 500 }
      );
    }

    const elevenRes = await fetch(`${ELEVENLABS_ENDPOINT}/${ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
        },
      }),
    });

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => "");
      console.error("❌ ElevenLabs error:", elevenRes.status, errText);

      // 502 = upstream provider error
      return NextResponse.json(
        {
          ok: false,
          error: "ElevenLabs request failed",
          status: elevenRes.status,
          details: errText?.slice(0, 2000) || null,
        },
        { status: 502 }
      );
    }

    const audioBuffer = await elevenRes.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        // optional: UI-ში download თუ დაგჭირდება
        // "Content-Disposition": 'inline; filename="voice.mp3"',
      },
    });
  } catch (err: any) {
    console.error("❌ compose error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
