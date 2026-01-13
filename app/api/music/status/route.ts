import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getPublicUrl(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("music").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("music_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map((row: any) => {
      const audioPath =
        row?.audio_path || row?.file_path || row?.storage_path || row?.path || null;

      const publicUrl = getPublicUrl(audioPath);

      return {
        ...row,
        publicUrl,
        url: publicUrl,
        fileUrl: publicUrl,
        filename: audioPath ? String(audioPath).split("/").pop() : null,
      };
    });

    return NextResponse.json({ ok: true, jobs: rows });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}