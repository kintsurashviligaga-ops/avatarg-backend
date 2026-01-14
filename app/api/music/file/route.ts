// app/api/music/file/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Minimal path sanitize: disallow schemes, backslashes, "..", and weird chars
function sanitizePath(input: string): string | null {
  const p = input.trim();
  if (!p) return null;
  if (p.length > 512) return null;

  // block absolute urls / schemes
  if (/^[a-zA-Z]+:\/\//.test(p)) return null;

  // block traversal and weird separators
  if (p.includes("..")) return null;
  if (p.includes("\\")) return null;

  // allow only safe chars
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(p)) return null;

  return p;
}

// Try to infer a filename from path
function filenameFromPath(path: string) {
  const last = path.split("/").pop() || "audio.mp3";
  return last.endsWith(".mp3") ? last : `${last}.mp3`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawPath = url.searchParams.get("path");

    if (!rawPath) {
      return NextResponse.json({ ok: false, error: "missing_path" }, { status: 400 });
    }

    const path = sanitizePath(rawPath);
    if (!path) {
      return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });
    }

    // ✅ Download file bytes from Supabase Storage (server-side)
    const { data, error } = await supabase.storage.from("music").download(path);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "download_failed", details: error.message },
        { status: 502 }
      );
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "file_empty" }, { status: 404 });
    }

    // data is a Blob
    const arrayBuffer = await data.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const filename = filenameFromPath(path);

    // ✅ Stream bytes from same-origin endpoint (no redirect, no CORS issues)
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",

        // Makes download work nicely when user clicks "Open remote"/"Download"
        "Content-Disposition": `inline; filename="${filename}"`,

        // helpful for debugging
        "X-AvatarG-Storage": "supabase-download",
        "X-AvatarG-Path": path,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}