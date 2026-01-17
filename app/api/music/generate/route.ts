import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body = await req.json().catch(() => null);
    
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length < 10) {
      return NextResponse.json(
        { error: "Prompt must be at least 10 characters" },
        { status: 400, headers }
      );
    }

    const duration = body?.duration || 30;
    const style = body?.style || "cinematic";

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      console.error("Missing ELEVENLABS_API_KEY");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500, headers }
      );
    }

    console.log("Calling ElevenLabs Music API:", {
      prompt: prompt.substring(0, 50) + "...",
      duration,
      style,
    });

    const elevenLabsResponse = await fetch(
      "https://api.elevenlabs.io/v1/sound-generation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: duration,
          prompt_influence: 0.3,
        }),
      }
    );

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("ElevenLabs Music API error:", elevenLabsResponse.status, errorText);
      return NextResponse.json(
        { 
          error: "Music generation failed",
          details: `ElevenLabs API returned ${elevenLabsResponse.status}` 
        },
        { status: 500, headers }
      );
    }

    const audioBuffer = await elevenLabsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");
    const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;

    console.log("Music generated successfully, size:", audioBuffer.byteLength);

    return NextResponse.json(
      {
        audioUrl,
        success: true,
        creditsUsed: 15,
      },
      { status: 200, headers }
    );

  } catch (err: any) {
    console.error("Music generation error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message ?? String(err),
      },
      { status: 500, headers }
    );
  }
}
