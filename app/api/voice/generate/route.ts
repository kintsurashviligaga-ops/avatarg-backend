import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ----------------------------- CORS ----------------------------- */
function corsHeaders(origin?: string | null) {
  const allowed = (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "*").trim();
  const o = (origin || "").trim();
  const allowOrigin = allowed === "*" ? (o || "*") : allowed;
  const useCredentials = allowOrigin !== "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...(useCredentials ? { "Access-Control-Allow-Credentials": "true" } : {}),
    Vary: "Origin",
  } as Record<string, string>;
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/* ----------------------------- POST ----------------------------- */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    // Parse request body
    const body = await req.json().catch(() => null);
    
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length < 10) {
      return NextResponse.json(
        { error: "Text must be at least 10 characters" },
        { status: 400, headers }
      );
    }

    const language = body?.language || "en";
    const emotion = typeof body?.emotion === "number" ? body.emotion : 50;

    // Get ElevenLabs API key
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      console.error("Missing ELEVENLABS_API_KEY");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500, headers }
      );
    }

    // Map language to voice ID (you can customize these)
    const voiceMap: Record<string, string> = {
      en: "21m00Tcm4TlvDq8ikWAM", // Rachel (English)
      ge: "21m00Tcm4TlvDq8ikWAM", // Use same for Georgian (multilingual model)
      ru: "21m00Tcm4TlvDq8ikWAM", // Russian
      cn: "21m00Tcm4TlvDq8ikWAM", // Chinese
    };

    const voiceId = voiceMap[language] || voiceMap.en;

    // Calculate stability based on emotion (0-100 → 0.0-1.0)
    const stability = Math.max(0, Math.min(1, (100 - emotion) / 100));
    const similarityBoost = Math.max(0, Math.min(1, emotion / 100));

    console.log("Calling ElevenLabs API:", {
      text: text.substring(0, 50) + "...",
      voiceId,
      stability,
      similarityBoost,
    });

    // Call ElevenLabs API
    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("ElevenLabs API error:", elevenLabsResponse.status, errorText);
      return NextResponse.json(
        { 
          error: "Voice generation failed",
          details: `ElevenLabs API returned ${elevenLabsResponse.status}` 
        },
        { status: 500, headers }
      );
    }

    // Get audio data
    const audioBuffer = await elevenLabsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");
    const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;

    console.log("Voice generated successfully, size:", audioBuffer.byteLength);

    // Return success response
    return NextResponse.json(
      {
        audioUrl,
        success: true,
        creditsUsed: 10,
      },
      { status: 200, headers }
    );

  } catch (err: any) {
    console.error("Voice generation error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message ?? String(err),
      },
      { status: 500, headers }
    );
  }
    }
