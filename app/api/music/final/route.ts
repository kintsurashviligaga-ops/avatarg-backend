import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// CORS helper (keeps it simple + safe)
function corsHeaders(origin?: string | null) {
  const allowed =
    (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN &&
      process.env.NEXT_PUBLIC_FRONTEND_ORIGIN.trim()) ||
    "*";

  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : origin || allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  } as Record<string, string>;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

/**
 * POST /api/music/final
 * Body: { job_id: string }
 *
 * Returns:
 *  - if completed: { status: "completed", job_id, audioUrl }
 *  - if processing: { status: "processing", job_id }
 *  - if error: { status: "error", job_id, error_message? }
 */
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const headers = corsHeaders(origin);

    const body = await req.json().catch(() => null);
    const jobId = String(body?.job_id || "").trim();
    if (!jobId) {
      return NextResponse.json(
        { error: "Missing job_id" },
        { status: 400, headers }
      );
    }

    // 1) read job
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("music_jobs")
      .select(
        "id,status,result_path,result_url,public_url,audio_path,audio_url,error_message,updated_at,created_at"
      )
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return NextResponse.json(
        { error: "Job not found", details: jobErr?.message || null },
        { status: 404, headers }
      );
    }

    // 2) if error
    if (job.status === "error") {
      return NextResponse.json(
        { status: "error", job_id: jobId, error_message: job.error_message || null },
        { status: 200, headers }
      );
    }

    // 3) if not completed yet
    if (job.status !== "completed") {
      return NextResponse.json(
        { status: "processing", job_id: jobId },
        { status: 200, headers }
      );
    }

    // 4) find path to file (prefer result_path)
    const path =
      job.result_path ||
      job.audio_path ||
      job.result_url ||
      job.audio_url ||
      job.public_url;

    if (!path) {
      return NextResponse.json(
        { status: "completed", job_id: jobId, audioUrl: null, warning: "Missing result_path" },
        { status: 200, headers }
      );
    }

    // If it already looks like a URL, return it
    if (typeof path === "string" && /^https?:\/\//i.test(path)) {
      return NextResponse.json(
        { status: "completed", job_id: jobId, audioUrl: path },
        { status: 200, headers }
      );
    }

    // 5) signed url from storage bucket
    const bucket = process.env.MUSIC_BUCKET || "music";
    const expiresIn = Number(process.env.SIGNED_URL_EXPIRES || 60 * 60); // 1 hour default

    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(String(path).replace(/^\/+/, ""), expiresIn);

    if (signedErr || !signed?.signedUrl) {
      return NextResponse.json(
        {
          status: "completed",
          job_id: jobId,
          audioUrl: null,
          error: "Failed to create signed url",
          details: signedErr?.message || null,
          bucket,
          path,
        },
        { status: 500, headers }
      );
    }

    // 6) optionally cache signed url in DB for convenience
    await supabaseAdmin
      .from("music_jobs")
      .update({ public_url: signed.signedUrl })
      .eq("id", jobId);

    return NextResponse.json(
      { status: "completed", job_id: jobId, audioUrl: signed.signedUrl },
      { status: 200, headers }
    );
  } catch (err: any) {
    const origin = req.headers.get("origin");
    const headers = corsHeaders(origin);
    return NextResponse.json(
      { error: "Internal error", message: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
  }
