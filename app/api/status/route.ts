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
      job: data,
    });
  } catch (err: any) {
    console.error("STATUS API CRASH:", err);

    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}