import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { ok: false, error: "missing_path" },
        { status: 400 }
      );
    }

    // ✅ PUBLIC bucket → პირდაპირ public URL
    const { data } = supabase
      .storage
      .from("music")
      .getPublicUrl(path);

    if (!data?.publicUrl) {
      return NextResponse.json(
        { ok: false, error: "public_url_not_found" },
        { status: 404 }
      );
    }

    // ✅ redirect instead of fetch
    return NextResponse.redirect(data.publicUrl);

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