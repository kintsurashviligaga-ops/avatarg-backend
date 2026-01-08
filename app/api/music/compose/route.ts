import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * ✅ CORS (mobile + web)
 */
const ALLOWED_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  const allowOrigin =
    !origin || ALLOWED_ORIGINS.includes("*")
      ? "*"
      : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

type ComposeBody = {
  /** required: music prompt or description */
  prompt: string;

  /** optional: ms (3000..600000) */
  music_length_ms?: number;

  /** optional: mp3_44100_128 | wav_44100 | ... (depends on provider) */
  output_format?: string;

  /** optional model id */
  model_id?: string;

  /** optional */
  force_instrumental?: boolean;

  /** optional */
  sign_with_c2pa?: boolean;

  /**
   * optional: some providers want "lyrics" separately; keep it if you need
   * (won’t break anything — we forward it only if present)
   */
  lyrics?: string;

  /** optional meta */
  title?: string;
  language?: string;
};

function jsonError(
  req: Request,
  status: number,
  message: string,
  extra?: Record<string, unknown>
) {
  const origin = req.headers.get("origin");
  return NextResponse.json(
    { error: message, ...(extra || {}) },
    { status, headers: corsHeaders(origin) }
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * ✅ MAIN: POST /api/music/compose
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY in environment variables" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }

  // ✅ Parse JSON safely
  let body: ComposeBody;
  try {
    body = (await req.json()) as ComposeBody;
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body",
        hint: "Postman: Body -> raw -> JSON, and Header Content-Type: application/json",
      },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  // ✅ Validate prompt
  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return jsonError(req, 400, "Missing required field: prompt");
  }
  if (prompt.length < 3) {
    return jsonError(req, 400, "Prompt is too short");
  }
  if (prompt.length > 4000) {
    return jsonError(req, 400, "Prompt is too long (max 4000 chars)");
  }

  // ✅ Normalize length
  const music_length_ms =
    typeof body.music_length_ms === "number"
      ? clamp(body.music_length_ms, 3000, 600000)
      : undefined;

  // ✅ Provider endpoint (configurable so you won't get stuck)
  // If ElevenLabs changes endpoint, just set ELEVENLABS_MUSIC_URL in Vercel.
  const musicUrl =
    process.env.ELEVENLABS_MUSIC_URL?.trim() ||
    "https://api.elevenlabs.io/v1/music";

  // ✅ Build payload (forward only known fields)
  const payload: Record<string, unknown> = {
    prompt,
  };

  if (music_length_ms !== undefined) payload.music_length_ms = music_length_ms;
  if (body.output_format) payload.output_format = body.output_format;
  if (body.model_id) payload.model_id = body.model_id;
  if (typeof body.force_instrumental === "boolean")
    payload.force_instrumental = body.force_instrumental;
  if (typeof body.sign_with_c2pa === "boolean")
    payload.sign_with_c2pa = body.sign_with_c2pa;

  // Optional extras (some music providers support these)
  if (body.lyrics) payload.lyrics = body.lyrics;
  if (body.title) payload.title = body.title;
  if (body.language) payload.language = body.language;

  // ✅ Call provider
  let upstream: Response;
  try {
    upstream = await fetch(musicUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // ElevenLabs uses "xi-api-key"
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "Failed to reach music provider",
        details: String(e?.message || e),
      },
      { status: 502, headers: corsHeaders(origin) }
    );
  }

  const contentType = upstream.headers.get("content-type") || "";

  // ✅ If provider returns error JSON/text — forward it clearly
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Music generation failed",
        status: upstream.status,
        provider_response: text?.slice(0, 4000) || "(empty)",
        hint:
          "Check ELEVENLABS_MUSIC_URL and API key permissions. Also verify payload fields supported by the provider.",
      },
      { status: upstream.status, headers: corsHeaders(origin) }
    );
  }

  /**
   * ✅ If provider returns AUDIO (mp3/wav) — stream it back
   */
  if (
    contentType.includes("audio/") ||
    contentType.includes("application/octet-stream")
  ) {
    const arrayBuffer = await upstream.arrayBuffer();

    // Default filename
    const filename = (body.title || "avatar-g-track")
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const ext = contentType.includes("wav") ? "wav" : "mp3";

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": contentType || "audio/mpeg",
        "Content-Disposition": `inline; filename="${filename || "track"}.${ext}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  /**
   * ✅ If provider returns JSON — return JSON
   */
  if (contentType.includes("application/json")) {
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: 200,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  }

  // ✅ Fallback: return text
  const txt = await upstream.text().catch(() => "");
  return NextResponse.json(
    { ok: true, raw: txt },
    { status: 200, headers: { ...corsHeaders(origin), "Cache-Control": "no-store" } }
  );
}
