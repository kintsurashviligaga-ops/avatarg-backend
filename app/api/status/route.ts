import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
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

    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .select(`
  id,
  status,
  prompt,
  duration_seconds,
  audio_url,
  audio_path,
  error_message,
  updated_at
`)
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "job_not_found", details: error?.message },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      job: {
        id: data.id,
        status: data.status,
        prompt: data.prompt,
        duration_seconds: data.duration_seconds,
audio_url: data.audio_url,
audio_path: data.audio_path,
        error_message: data.error_message,
        updated_at: data.updated_at,
      },
    });
  } catch (err: any) {
    console.error("GET /api/music/status failed:", err);
    return NextResponse.json(
      { ok: false, error: "server_error", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
