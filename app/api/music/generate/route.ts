import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function corsHeaders(origin?: string | null) {
  const allowed = process.env.NEXT_PUBLIC_FRONTEND_ORIGIN
    ? process.env.NEXT_PUBLIC_FRONTEND_ORIGIN
    : "*";

  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : (origin ?? allowed),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body = await req.json().catch(() => null);

    const prompt = String(body?.prompt ?? "").trim();

    // optional config (worker გამოიყენებს თუ უნდა)
    const music_length_ms =
      body?.music_length_ms != null ? Number(body.music_length_ms) : 30000;
    const output_format = String(body?.output_format ?? "mp3");
    const model_id = String(body?.model_id ?? "music_v1");
    const force_instrumental = Boolean(body?.force_instrumental ?? false);

    if (!prompt || prompt.length < 5) {
      return NextResponse.json(
        { ok: false, error: "prompt_required" },
        { status: 400, headers }
      );
    }

    const createdAt = new Date().toISOString();

    // ✅ Insert job into DB queue
    const { data, error } = await supabaseAdmin
      .from("music_jobs")
      .insert({
        status: "queued",
        prompt,
        music_length_ms: Number.isFinite(music_length_ms) ? music_length_ms : 30000,
        output_format,
        model_id,
        force_instrumental,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select("id,status,created_at")
      .single();

    if (error) {
      console.error("music_jobs insert error:", error);
      return NextResponse.json(
        { ok: false, error: "db_insert_failed", details: error.message },
        { status: 500, headers }
      );
    }

    // ✅ Always return jobId (stable contract for UI)
    return NextResponse.json(
      { ok: true, jobId: data.id, status: data.status, createdAt: data.created_at },
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error("POST /api/music/generate failed:", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: "server_error", details: err?.message ?? String(err) },
      { status: 500, headers }
    );
  }
}
