import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { fetch },
  });
}

// ✅ Health check for UI ("Endpoint Check")
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      route: "/api/pentagon",
      methods: ["POST"],
      note: "Local endpoint ready (creates render job in Supabase).",
      ts: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    const userPrompt = body?.userPrompt;
    const constraints = body?.constraints ?? {};

    if (!userPrompt || typeof userPrompt !== "string") {
      return NextResponse.json(
        { success: false, error: "userPrompt is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ Create render job in Supabase
    const payload = { userPrompt, constraints };

    const { data, error } = await supabase
      .from("render_jobs")
      .insert({
        status: "queued",
        progress: 0,
        payload,
        result_url: null,
        error_message: null,
      })
      .select("id,status,progress")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: error?.message || "Insert failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ Return jobId to frontend (polling starts from here)
    return NextResponse.json(
      {
        success: true,
        renderJobId: data.id,
        status: data.status,
        progress: data.progress,
        statusEndpoint: `/api/render-status/${data.id}`,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
