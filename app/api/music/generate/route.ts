import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function corsHeaders(origin?: string | null) {
  const allowed = (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "").trim();
  const allowOrigin = allowed || origin || "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };

  if (allowOrigin !== "*") headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/**
 * POST /api/music/generate
 * ქმნის music_jobs-ში ახალ ჩანაწერს (queued)
 * აბრუნებს { ok:true, jobId }
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body = await req.json().catch(() => null);

    const prompt = String(body?.prompt || body?.text || "").trim();
    if (prompt.length < 6) {
      return NextResponse.json(
        { ok: false, error: "prompt_too_short" },
        { status: 400, headers }
      );
    }

    const music_length_ms = Number(body?.music_length_ms || 30000);
    const output_format = String(body?.output_format || "mp3");
    const model_id = String(body?.model_id || "music_v1");
    const force_instrumental = Boolean(body?.force_instrumental || false);

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .insert({
        status: "queued",
        prompt,
        music_length_ms,
        output_format,
        model_id,
        force_instrumental,
        public_url: null,
        filename: null,
        error_message: null,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      return NextResponse.json(
        { ok: false, error: "db_insert_failed", details: error?.message || null },
        { status: 500, headers }
      );
    }

    return NextResponse.json({ ok: true, jobId: data.id }, { status: 200, headers });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", details: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}