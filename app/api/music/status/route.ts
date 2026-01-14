import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function corsHeaders(origin?: string | null) {
  const allowed = (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "").trim();
  const allowOrigin = allowed || origin || "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export async function GET(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const url = new URL(req.url);
    const jobId = (url.searchParams.get("jobId") || url.searchParams.get("id") || "").trim();

    if (!jobId) {
      return NextResponse.json({ ok: false, error: "missing_job_id" }, { status: 400, headers });
    }

    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .select("id,status,filename,error_message,updated_at")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_read_failed", details: error.message },
        { status: 500, headers }
      );
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "not_found", id: jobId }, { status: 404, headers });
    }

    // ✅ IMPORTANT: ჩვენ ზუსტად ვიცით file path schema
    // worker წერს: music/jobs/<jobId>.mp3
    const path = `jobs/${data.id}.mp3`;
    const fileUrl = `/api/music/file?path=${encodeURIComponent(path)}`;

    return NextResponse.json(
      {
        ok: true,
        result: {
          id: data.id,
          status: data.status,
          fileUrl,                 // ✅ UI MUST USE THIS
          path,                    // debug
          filename: data.filename || `avatar-g-${data.id}.mp3`,
          errorMessage: data.error_message || null,
          updatedAt: data.updated_at || null,
        },
      },
      { status: 200, headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", details: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}