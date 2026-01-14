import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Minimal path sanitize: disallow schemes, backslashes, "..", and absolute urls
function sanitizePath(input: string): string | null {
  const p = input.trim();

  if (!p) return null;
  if (p.length > 512) return null;

  // block absolute urls / schemes
  if (/^[a-zA-Z]+:\/\//.test(p)) return null;

  // block traversal and weird separators
  if (p.includes("..")) return null;
  if (p.includes("\\")) return null;

  // optional: allow only common chars (safe)
  // jobs/uuid.mp3 → ok
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

    // ✅ PUBLIC bucket → direct public URL
    const { data } = supabase.storage.from("music").getPublicUrl(path);
    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
      return NextResponse.json({ ok: false, error: "public_url_not_found" }, { status: 404 });
    }

    // ✅ redirect for browser audio/download (no fetch issues)
    // Use 302 to avoid caching old urls; plus explicit no-store headers.
    const res = NextResponse.redirect(publicUrl, { status: 302 });

    res.headers.set("Cache-Control", "no-store, max-age=0");
    res.headers.set("Pragma", "no-cache");

    // helpful for debugging in Network tab
    res.headers.set("X-AvatarG-Storage", "supabase-public");
    res.headers.set("X-AvatarG-Path", path);

    return res;
  } catch (err: any) {
    console.error("🔥 FILE ROUTE ERROR:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}