import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const runtime = "nodejs";

/**
 * CORS:
 * - If you use credentials, you MUST NOT use "*"
 * - We set Allow-Origin only when we have an origin to echo OR a configured allowed origin.
 * - For same-origin requests, CORS headers don't matter, but returning empty origin can break some clients.
 */
function corsHeaders(origin?: string | null) {
  const allowed = (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "").trim();

  // Prefer explicit allowed origin; else echo request origin; else fall back to "*"
  const allowOrigin = allowed || origin || "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };

  // Only set credentials when origin is NOT "*"
  if (allowOrigin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/**
 * GET /api/music/status?jobId=... (supports also ?id=...)
 * Response:
 * { ok:true, result:{ id,status,publicUrl,filename,errorMessage,updatedAt } }
 */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const url = new URL(req.url);

    // Support both: jobId OR id
    const jobId = (url.searchParams.get("jobId") || url.searchParams.get("id") || "").trim();

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "missing_job_id" },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .select("id,status,public_url,filename,error_message,updated_at")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_read_failed", details: error.message },
        { status: 500, headers }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found", id: jobId },
        { status: 404, headers }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        result: {
          id: data.id,
          status: data.status,
          publicUrl: data.public_url,
          filename: data.filename,
          errorMessage: data.error_message,
          updatedAt: data.updated_at,
        },
      },
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error("GET /api/music/status failed:", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: "server_error", details: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}
