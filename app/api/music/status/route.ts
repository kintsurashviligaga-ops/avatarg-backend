import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function pickPath(job: any): string {
  return (
    job?.audio_path ||
    job?.audioPath ||
    job?.file_path ||
    job?.filePath ||
    job?.path ||
    job?.storage_path ||
    job?.storagePath ||
    ""
  );
}

function makePublicUrl(path: string): string {
  // bucket: music (PUBLIC)
  const { data } = supabase.storage.from("music").getPublicUrl(path);
  return data?.publicUrl || "";
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

    if (error) {
      console.error("❌ Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: "job_not_found", details: error.message },
        { status: 404 }
      );
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "job_empty" }, { status: 404 });
    }

    // ✅ Convert stored path -> PUBLIC URL (NO signed urls)
    const path = pickPath(data);
    const publicUrl = path ? makePublicUrl(path) : "";

    // ✅ Normalize response for UI compatibility
    const result = {
      ...data,
      publicUrl: publicUrl || data.publicUrl || data.public_url || data.url || data.fileUrl || null,
      public_url: publicUrl || data.public_url || null,
      url: publicUrl || data.url || null,
      fileUrl: publicUrl || data.fileUrl || null,
      filename: data.filename || (path ? path.split("/").pop() : null),
      errorMessage: data.error_message || data.errorMessage || null,
      updatedAt: data.updated_at || data.updatedAt || null,
    };

    return NextResponse.json({
      ok: true,
      job: result,
      result,
    });
  } catch (err: any) {
    console.error("🔥 STATUS API CRASH:", err);
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