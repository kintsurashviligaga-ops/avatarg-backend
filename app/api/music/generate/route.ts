import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function corsHeaders(origin?: string | null) {
  const allowed = process.env.NEXT_PUBLIC_FRONTEND_ORIGIN
    ? process.env.NEXT_PUBLIC_FRONTEND_ORIGIN
    : "*";

  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : (origin ?? allowed),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * GET /api/music/status?jobId=...
 * Response:
 * { ok:true, job:{ id,status,prompt,public_url,audio_path,error_message,created_at,updated_at } }
 */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const url = new URL(req.url);
    const jobId = (url.searchParams.get("jobId") || "").trim();

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "jobId_required" },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .select(
        "id,status,prompt,public_url,audio_path,error_message,created_at,updated_at"
      )
      .eq("id", jobId)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_read_failed", details: error.message },
        { status: 500, headers }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers }
      );
    }

    return NextResponse.json({ ok: true, job: data }, { status: 200, headers });
  } catch (err: any) {
    console.error("GET /api/music/status failed:", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: "server_error", details: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}
