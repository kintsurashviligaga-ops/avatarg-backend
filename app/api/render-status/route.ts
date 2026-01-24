import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  // IMPORTANT: do NOT throw at module load time (prevents Vercel build errors)
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { fetch },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const jobId = params?.jobId;
  if (!jobId) {
    return NextResponse.json(
      { success: false, error: "jobId is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { data, error } = await supabase
    .from("render_jobs")
    .select("id,status,progress,result_url,error_message,created_at,updated_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Job not found", jobId },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      success: true,
      job: {
        id: data.id,
        status: data.status,
        progress: data.progress,
        resultUrl: data.result_url,
        errorMessage: data.error_message,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
