import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 👇 ყველა შესაძლო path ველის ამოღება
function pickStoragePath(job: any): string {
  return (
    job.audio_path ||
    job.audioPath ||
    job.file_path ||
    job.filePath ||
    job.storage_path ||
    job.storagePath ||
    job.path ||
    ""
  );
}

function buildPublicUrl(path: string): string {
  if (!path) return "";
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

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "job_not_found" },
        { status: 404 }
      );
    }

    // 🔑 აქ არის მთავარი ფიქსი
    const storagePath = pickStoragePath(data);
    const publicUrl = buildPublicUrl(storagePath);

    const result = {
      ...data,
      status: data.status,
      publicUrl,
      public_url: publicUrl, // legacy support
      url: publicUrl,
      fileUrl: publicUrl,
      filename:
        data.filename || (storagePath ? storagePath.split("/").pop() : null),
      errorMessage: data.error_message || data.errorMessage || null,
      updatedAt: data.updated_at || data.updatedAt || null,
    };

    return NextResponse.json({
      ok: true,
      result,
      job: result, // backward compatibility
    });
  } catch (err: any) {
    console.error("🔥 STATUS API ERROR:", err);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}