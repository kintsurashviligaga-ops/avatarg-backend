// app/api/music/status/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function corsHeaders(origin?: string | null) {
  const allowed = (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "").trim();

  // Prefer explicit allowed origin; else echo request origin; else "*"
  const allowOrigin = allowed || origin || "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  };

  // Only set credentials when origin is NOT "*"
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
 * Extract object path inside "music" bucket from Supabase public URL.
 * Supports:
 *  - .../storage/v1/object/public/music/<PATH>
 *  - .../storage/v1/object/public/music/<PATH>?...
 */
function extractMusicPath(publicUrl?: string | null): string | null {
  if (!publicUrl) return null;

  try {
    const u = new URL(publicUrl);
    const prefix = "/storage/v1/object/public/music/";
    const idx = u.pathname.indexOf(prefix);
    if (idx === -1) return null;

    const tail = u.pathname.slice(idx + prefix.length);
    if (!tail) return null;

    // decode in case path has %20 etc, then keep as raw path string
    const cleaned = decodeURIComponent(tail).trim();
    return cleaned || null;
  } catch {
    // fallback: non-URL input
    const marker = "/storage/v1/object/public/music/";
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    const tail = publicUrl.slice(idx + marker.length);
    const cleaned = (tail.split("?")[0] || "").trim();
    return cleaned || null;
  }
}

/**
 * Build absolute URL for /api/music/file?path=...
 * This avoids problems when frontend origin differs.
 */
function buildFileUrl(req: Request, path: string) {
  const base = new URL(req.url);
  base.pathname = "/api/music/file";
  base.search = `path=${encodeURIComponent(path)}`;
  return base.toString();
}

/**
 * GET /api/music/status?id=...  (supports also ?jobId=...)
 * Returns status + fileUrl (proxy) to avoid CORS/redirect issues on Play/Download.
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

    // Only compute fileUrl when done (cleaner UI logic)
    const isDone = String(data.status).toLowerCase() === "done";
    const path = isDone ? extractMusicPath(data.public_url) : null;
    const fileUrl = path ? buildFileUrl(req, path) : null;

    return NextResponse.json(
      {
        ok: true,
        result: {
          id: data.id,
          status: data.status,

          // remote public url (debug / open in new tab)
          publicUrl: data.public_url || null,

          // ✅ best URL for fetch/play/download
          fileUrl,

          // optional debug
          path,

          filename: data.filename || null,
          errorMessage: data.error_message || null,
          updatedAt: data.updated_at || null,
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