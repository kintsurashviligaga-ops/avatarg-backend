import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DB-ში შეიძლება სხვადასხვა ველზე ეწეროს mp3 path/url — აქედან ამოვიღებთ
function pickStoragePath(row: any): string {
  return (
    row?.audio_path ||
    row?.audioPath ||
    row?.file_path ||
    row?.filePath ||
    row?.storage_path ||
    row?.storagePath ||
    row?.path ||
    row?.object_path ||
    row?.objectPath ||
    ""
  );
}

function pickAnyUrl(row: any): string {
  return (
    row?.publicUrl ||
    row?.public_url ||
    row?.fileUrl ||
    row?.url ||
    row?.audio_url ||
    row?.audioUrl ||
    ""
  );
}

function buildPublicUrlFromPath(path: string): string {
  if (!path) return "";
  // bucket = "music" (თქვენს შემთხვევაში)
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
      console.error("❌ Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: "job_not_found", details: error?.message ?? null },
        { status: 404 }
      );
    }

    // 1) ჯერ DB-ში თუ უკვე არის url/publicUrl — ავიღოთ
    const existingUrl = pickAnyUrl(data);

    // 2) თუ არ არის, მაშინ path-იდან ავაგოთ PUBLIC URL
    const storagePath = pickStoragePath(data);
    const publicUrl = existingUrl || buildPublicUrlFromPath(storagePath);

    // 3) result-ში დავაბრუნოთ ყველა compatibility ველი, რომ UI-მ ყოველთვის დაიჭიროს
    const result = {
      ...data,
      publicUrl: publicUrl || null,
      public_url: publicUrl || null,
      url: publicUrl || null,
      fileUrl: publicUrl || null,
      filename:
        data?.filename ||
        (storagePath ? String(storagePath).split("/").pop() : null),
      errorMessage: data?.error_message || data?.errorMessage || null,
      updatedAt: data?.updated_at || data?.updatedAt || null,
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