import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/* ----------------------------- CORS ----------------------------- */
function corsHeaders(origin?: string | null) {
  const allowed = process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "*";
  const o = origin || "";

  // ✅ If credentials=true, "*" is not allowed
  const allowOrigin = allowed === "*" ? (o || "*") : allowed;
  const useCredentials = allowOrigin !== "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...(useCredentials ? { "Access-Control-Allow-Credentials": "true" } : {}),
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/* ----------------------------- POST ----------------------------- */
/**
 * Creates a voice generation job.
 * Worker will pick it up and process with ElevenLabs.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body = await req.json().catch(() => null);

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Missing/invalid required field: text" },
        { status: 400, headers }
      );
    }

    const {
      voice_id = "default",
      model_id = "eleven_multilingual_v2",
      output_format = "mp3_44100_128",
      stability = 0.5,
      similarity_boost = 0.75,
      style = 0.0,
      use_speaker_boost = true,
      user_id = null,
      metadata = null,
    } = body || {};

    const { data, error } = await supabaseAdmin
      .from("voice_jobs")
      .insert({
        user_id,
        text,
        voice_id,
        model_id,
        output_format,
        stability,
        similarity_boost,
        style,
        use_speaker_boost,
        status: "queued",
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to create voice job", details: error.message },
        { status: 500, headers }
      );
    }

    return NextResponse.json({ ok: true, job: data }, { status: 201, headers });
  } catch (err: any) {
    console.error("Voice API error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error", details: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}
