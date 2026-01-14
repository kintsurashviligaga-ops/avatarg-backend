import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get("path");

    if (!rawPath) {
      return NextResponse.json({ ok: false, error: "missing_path" }, { status: 400 });
    }

    const path = sanitizePath(rawPath);
    if (!path) {
      return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });
    }

    // ✅ Get public url
    const { data } = supabase.storage.from("music").getPublicUrl(path);
    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
      return NextResponse.json({ ok: false, error: "public_url_not_found" }, { status: 404 });
    }

    // ✅ Server-side fetch (NO CORS issues in browser)
    const r = await fetch(publicUrl, { cache: "no-store" });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "upstream_fetch_failed", status: r.status, details: t.slice(0, 500) },
        { status: 502 }
      );
    }

    const arrayBuffer = await r.arrayBuffer();

    const res = new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-AvatarG-Proxy": "1",
        "X-AvatarG-Path": path,
      },
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}