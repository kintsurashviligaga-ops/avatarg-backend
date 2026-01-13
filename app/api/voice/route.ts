import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/* ----------------------------- CORS ----------------------------- */
function corsHeaders(origin?: string | null) {
  const allowed = process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "*";

  // If you set NEXT_PUBLIC_FRONTEND_ORIGIN="*" -> allow all
  if (allowed === "*") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      // NOTE: credentials cannot be true with "*"
      "Access-Control-Allow-Credentials": "false",
      Vary: "Origin",
    };
  }

  // If you set NEXT_PUBLIC_FRONTEND_ORIGIN to a specific origin (e.g. https://avatarg.app)
  const allowOrigin = origin && origin === allowed ? origin : allowed;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/* ----------------------------- helpers ----------------------------- */
function clamp01(n: any, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function safeString(v: any, fallback = "") {
  return typeof v === "string" ? v : fallback;
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

    const text = safeString(body?.text).trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: text" },
        { status: 400, headers }
      );
    }

    // optional: prevent huge payloads
    const maxChars = Number(process.env.VOICE_TEXT_MAX_CHARS || 5000);
    if (text.length > maxChars) {
      return NextResponse.json(
        { ok: false, error: `Text too long (max ${maxChars} chars)` },
        { status: 413, headers }
      );
    }

    const voice_id = safeString(body?.voice_id, "default").trim() || "default";
    const model_id = safeString(body?.model_id, "eleven_multilingual_v2");
    const output_format = safeString(body?.output_format, "mp3_44100_128");

    const stability = clamp01(body?.stability, 0.5);
    const similarity_boost = clamp01(body?.similarity_boost, 0.75);
    const style = clamp01(body?.style, 0.0);
    const use_speaker_boost =
      typeof body?.use_speaker_boost === "boolean" ? body.use_speaker_boost : true;

    const user_id = body?.user_id ?? null;
    const metadata = body?.metadata ?? null;

    // supabaseAdmin might be a client OR a function that returns client
    const sb: any = typeof supabaseAdmin === "function" ? supabaseAdmin() : supabaseAdmin;

    const { data, error } = await sb
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
        { ok: false, error: "Failed to create voice job" },
        { status: 500, headers }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        jobId: data?.id,
        job: data,
      },
      { status: 201, headers }
    );
  } catch (err: any) {
    console.error("Voice API error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        details: err?.message ?? String(err),
      },
      { status: 500, headers }
    );
  }
        }
