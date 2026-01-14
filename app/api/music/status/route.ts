// app/api/music/file/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function corsHeaders(origin?: string | null) {
  const allowed = (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "").trim();
  const allowOrigin = allowed || origin || "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };

  if (allowOrigin !== "*") headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

// Minimal sanitize: disallow schemes, backslashes, "..", absolute urls
function sanitizePath(input: string): string | null {
  const p = input.trim();
  if (!p) return null;
  if (p.length > 512) return null;
  if (/^[a-zA-Z]+:\/\//.test(p)) return null;
  if (p.includes("..")) return null;
  if (p.includes("\\")) return null;
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(p)) return null;
  return p;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get("path");

    if (!rawPath) {
      return NextResponse.json({ ok: false, error: "missing_path" }, { status: 400, headers });
    }

    const path = sanitizePath(rawPath);
    if (!path) {
      return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400, headers });
    }

    // Get public URL from Supabase Storage (bucket: music)
    const { data } = supabase.storage.from("music").getPublicUrl(path);
    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
      return NextResponse.json({ ok: false, error: "public_url_not_found" }, { status: 404, headers });
    }

    // ✅ Server-side fetch the audio and return bytes (NO redirect!)
    const upstream = await fetch(publicUrl, { cache: "no-store" });

    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "upstream_fetch_failed", status: upstream.status, details: t.slice(0, 1000) },
        { status: 502, headers }
      );
    }

    const contentType = upstream.headers.get("content-type") || "audio/mpeg";
    const buf = await upstream.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": contentType,
        "Content-Length": String(buf.byteLength),
        "Accept-Ranges": "bytes",
        // optional:
        // "Content-Disposition": 'inline; filename="music.mp3"',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", message: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}