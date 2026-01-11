import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const { data: job, error } = await supabase
      .from("music_jobs")
      .select("audio_path")
      .eq("id", jobId)
      .single();

    if (error || !job?.audio_path) {
      return NextResponse.json(
        { error: "Audio not found for this job" },
        { status: 404 }
      );
    }

    const { data: signed, error: signError } =
      await supabase.storage
        .from("music")
        .createSignedUrl(job.audio_path, 60 * 60);

    if (signError || !signed?.signedUrl) {
      return NextResponse.json(
        { error: "Failed to sign URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      signedUrl: signed.signedUrl,
    });
  } catch (err) {
    console.error("SIGNED URL ERROR:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
