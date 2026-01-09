import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel route max execution (helps avoid early cutoffs)
export const maxDuration = 60;

// -------- CORS --------
function corsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin") ?? "*"),
  });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return NextResponse.json(
    {
      ok: true,
      endpoint: "/api/music/final",
      message: "Alive. Use POST with JSON body: { prompt, duration_sec?, instrumental?, model_id? }",
    },
    { status: 200, headers: corsHeaders(origin) }
  );
}

// -------- Helpers --------
function jsonError(origin: string, status: number, message: string, extra?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ? { extra } : {}) },
    { status, headers: corsHeaders(origin) }
  );
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) {
    return jsonError(origin, 500, "Missing ELEVENLABS_API_KEY in environment variables");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(origin, 400, "Invalid JSON body");
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const duration_sec =
    typeof body?.duration_sec === "number" ? body.duration_sec : 30;
  const instrumental =
    typeof body?.instrumental === "boolean" ? body.instrumental : false;
  const model_id =
    typeof body?.model_id === "string" ? body.model_id : "music_v1";

  if (!prompt) {
    return jsonError(origin, 400, "Prompt is required");
  }

  // clamp duration (safety + provider limits)
  const duration = Math.max(5, Math.min(120, Math.floor(duration_sec)));

  // If client wants raw audio, they can set Accept: audio/mpeg
  const accept = (req.headers.get("accept") || "").toLowerCase();
  const wantsAudio = accept.includes("audio/") || accept.includes("audio/mpeg");

  // Abort after ~55s to avoid hanging forever
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const elevenRes = await fetch("https://api.elevenlabs.io/v1/music/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
        Accept: wantsAudio ? "audio/mpeg" : "application/json",
      },
      body: JSON.stringify({
        prompt,
        duration_seconds: duration, // many APIs use duration_seconds (more common)
        duration_sec: duration,     // keep both keys for compatibility
        instrumental,
        model_id,
      }),
      signal: controller.signal,
    });

    const ct = (elevenRes.headers.get("content-type") || "").toLowerCase();

    // Error from provider
    if (!elevenRes.ok) {
      // try read json or text safely
      let providerBody: any = null;
      try {
        providerBody = ct.includes("application/json")
          ? await elevenRes.json()
          : await elevenRes.text();
      } catch {
        providerBody = null;
      }
      return jsonError(origin, elevenRes.status, "ElevenLabs request failed", {
        status: elevenRes.status,
        contentType: ct,
        body: providerBody,
      });
    }

    // If provider returns audio bytes
    if (ct.includes("audio/") || ct.includes("application/octet-stream")) {
      const buf = Buffer.from(await elevenRes.arrayBuffer());

      // If client asked for audio, return audio directly
      if (wantsAudio) {
        return new NextResponse(buf, {
          status: 200,
          headers: {
            ...corsHeaders(origin),
            "Content-Type": ct.includes("audio/") ? ct : "audio/mpeg",
            "Content-Length": String(buf.length),
            "Cache-Control": "no-store",
          },
        });
      }

      // Otherwise return JSON with base64
      const b64 = buf.toString("base64");
      return NextResponse.json(
        {
          ok: true,
          prompt,
          duration_sec: duration,
          instrumental,
          model_id,
          audio_base64: b64,
          audio_mime: ct.includes("audio/") ? ct : "audio/mpeg",
        },
        { status: 200, headers: corsHeaders(origin) }
      );
    }

    // If provider returns JSON
    const data = await elevenRes.json();
    return NextResponse.json(
      { ok: true, prompt, duration_sec: duration, instrumental, model_id, data },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return jsonError(origin, 504, "Timed out waiting for ElevenLabs (try shorter duration or retry)");
    }
    return jsonError(origin, 500, "Server error", { message: String(err?.message || err) });
  } finally {
    clearTimeout(timeout);
  }
}
