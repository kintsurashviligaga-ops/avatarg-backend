import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractPath(row: any): string {
  return (
    row?.audio_path ||
    row?.file_path ||
    row?.storage_path ||
    row?.path ||
    ""
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "missing_job_id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("music_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "job_not_found" },
        { status: 404 }
      );
    }

    let publicUrl: string | null = null;

    // 🔑 PUBLIC bucket URL (NO signed URL)
    const path = extractPath(data);
    if (path) {
      const { data: urlData } = supabase
        .storage
        .from("music")
        .getPublicUrl(path);

      publicUrl = urlData?.publicUrl ?? null;
    }

    const result = {
      ...data,
      status: data.status,
      publicUrl,
      url: publicUrl,
      fileUrl: publicUrl,
      filename: path ? path.split("/").pop() : null,
    };

    return NextResponse.json({
      ok: true,
      job: result,
      result,
    });

  } catch (err: any) {
    console.error("🔥 STATUS API ERROR:", err);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: err?.message },
      { status: 500 }
    );
  }
}