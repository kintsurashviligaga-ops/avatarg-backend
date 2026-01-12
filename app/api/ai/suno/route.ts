import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function corsHeaders(origin?: string | null) {
  const allowed =
    process.env.NEXT_PUBLIC_FRONTEND_ORIGIN
      ? process.env.NEXT_PUBLIC_FRONTEND_ORIGIN
      : "*";

  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : (origin ?? allowed),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body = await req.json().catch(() => null);

    const prompt = String(body?.prompt ?? "").trim();
    const durationSec = body?.durationSec != null ? Number(body.durationSec) : null;

    if (!prompt || prompt.length < 5) {
      return NextResponse.json(
        { ok: false, error: "prompt_required" },
        { status: 400, headers }
      );
    }

    // Insert job into queue
    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .insert({
        status: "queued",
        prompt,
        duration_sec: Number.isFinite(durationSec) ? durationSec : null,
        created_at: new Date().toISOString(),
      })
      .select("id,status,prompt,duration_sec,created_at")
      .single();

    if (error) {
      console.error("music_jobs insert error:", error);
      return NextResponse.json(
        { ok: false, error: "db_insert_failed", details: error.message },
        { status: 500, headers }
      );
    }

    return NextResponse.json({ ok: true, job: data }, { status: 200, headers });
  } catch (err: any) {
    console.error("POST /api/ai/suno failed:", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: "server_error", details: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}
