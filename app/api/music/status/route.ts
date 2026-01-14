// app/api/music/status/route.ts
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

/**
 * Supabase public_url → extract object path inside "music" bucket
 * e.g. https://xxx.supabase.co/storage/v1/object/public/music/<PATH>
 */
function extractMusicPath(publicUrl?: string | null): string | null {
  if (!publicUrl) return null;

  const marker = "/storage/v1/object/public/music/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;

  const tail = publicUrl.slice(idx + marker.length);
  if (!tail) return null;

  return (tail.split("?")[0] || "").trim() || null;
}

/**
 * GET /api/music/status?id=...  (supports also ?jobId=...)
 * UI-სთვის აბრუნებს სტატუსს + fileUrl (same-origin proxy) რომ Download/Play არ დაეცეს CORS-ზე
 */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const url = new URL(req.url);
    const jobId = (url.searchParams.get("jobId") || url.searchParams.get("id") || "").trim();

    if (!jobId) {
      return NextResponse.json({ ok: false, error: "missing_job_id" }, { status: 400, headers });
    }

    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .select("id,status,public_url,filename,error_message,updated_at")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      console.error("❌ music/status db_read_failed:", error);
      return NextResponse.json(
        { ok: false, error: "db_read_failed", details: error.message },
        { status: 500, headers }
      );
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "not_found", id: jobId }, { status: 404, headers });
    }

    const path = extractMusicPath(data.public_url);
    const fileUrl = path ? `/api/music/file?path=${encodeURIComponent(path)}` : null;

    return NextResponse.json(
      {
        ok: true,
        result: {
          id: data.id,
          status: data.status,
          publicUrl: data.public_url, // debug / open remote
          fileUrl,                   // ✅ USE THIS for fetch/play/download
          path,                       // optional debug
          filename: data.filename,
          errorMessage: data.error_message,
          updatedAt: data.updated_at,
        },
      },
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error("🔥 music/status server_error:", err);
    return NextResponse.json(
      { ok: false, error: "server_error", details: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}