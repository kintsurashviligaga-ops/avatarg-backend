import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * ✅ CORS FIX:
 * - If you want credentials: CANNOT use "*"
 * - We allow only specific origin (NEXT_PUBLIC_FRONTEND_ORIGIN) or echo request origin
 */
function corsHeaders(origin?: string | null) {
  const allowed = process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "";

  // If you didn't set allowed origin, fall back to request origin (still not "*")
  const allowOrigin = allowed || origin || "";

  return {
    "Access-Control-Allow-Origin": allowOrigin, // ✅ never "*"
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
 * GET /api/music/status?jobId=...   (supports also ?id=...)
 * Response:
 * { ok:true, result:{ id,status,publicUrl,filename,errorMessage,updatedAt } }
 */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const url = new URL(req.url);

    // ✅ Support both params: jobId OR id (so UI won't break)
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
