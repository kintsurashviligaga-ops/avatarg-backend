import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function corsHeaders(origin?: string | null) {
  const allowed = process.env.NEXT_PUBLIC_FRONTEND_ORIGIN ?? "*";

  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : origin || allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/**
 * GET /api/music/status?id=JOB_ID
 * Response:
 * { ok:true, result:{ id,status,publicUrl,filename,errorMessage,updatedAt } }
 */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const url = new URL(req.url);
    const id = (url.searchParams.get("id") || "").trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing ?id=JOB_ID" },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .select("id,status,public_url,filename,error_message,updated_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Job not found" },
        { status: 404, headers }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        result: {
          id: data.id,
          status: data.status,
          publicUrl: data.public_url,
          filename: data.filename,
          errorMessage: data.error_message,
          updatedAt: data.updated_at ?? null,
        },
      },
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error("GET /api/music/status failed:", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}
