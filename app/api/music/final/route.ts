import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- CORS ----------
function corsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin") ?? "*"),
  });
}

// ---------- POST ----------
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  const headers = corsHeaders(origin);

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing ELEVENLABS_API_KEY" },
      { status: 500, headers }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers }
    );
  }

  const {
    prompt,
    duration_sec = 30,
    instrumental = false,
    model_id = "music_v1",
  } = body;

  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: "prompt is required" },
      { status: 400, headers }
    );
  }

  try {
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

    const contentType = elevenRes.headers.get("content-type") || "";

    // 🎵 If ElevenLabs returns audio
    if (contentType.includes("audio")) {
      const audio = await elevenRes.arrayBuffer();
      return new NextResponse(audio, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": contentType,
        },
      });
    }

    // 📦 Otherwise JSON
    const text = await elevenRes.text();
    const data = text ? JSON.parse(text) : null;

    if (!elevenRes.ok) {
      return NextResponse.json(
        { ok: false, error: "ElevenLabs error", details: data },
        { status: 502, headers }
      );
    }

    return NextResponse.json(
      { ok: true, result: data },
      { status: 200, headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500, headers }
    );
  }
}
