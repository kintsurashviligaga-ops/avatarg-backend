// app/api/music/file/route.ts
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
  if (p.includes("..") || p.includes("\\") || p.startsWith("http")) return null;
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

    // 1️⃣ get public url
    const { data } = supabase.storage.from("music").getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ ok: false, error: "public_url_not_found" }, { status: 404 });
    }

    // 2️⃣ fetch audio server-side
    const audioRes = await fetch(publicUrl);
    if (!audioRes.ok) {
      return NextResponse.json(
        { ok: false, error: "audio_fetch_failed" },
        { status: 502 }
      );
    }

    // 3️⃣ stream to browser (NO redirect)
    return new NextResponse(audioRes.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}