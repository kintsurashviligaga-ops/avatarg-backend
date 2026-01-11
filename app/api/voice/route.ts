import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs"; // ✅ ElevenLabs + Supabase admin = stable on node

function corsHeaders(origin?: string | null) {
  const allowed =
    process.env.NEXT_PUBLIC_FRONTEND_ORIGIN && process.env.NEXT_PUBLIC_FRONTEND_ORIGIN !== "*"
      ? process.env.NEXT_PUBLIC_FRONTEND_ORIGIN
      : "*";

  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : origin || allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const headers = corsHeaders(origin);

    const body = await req.json().catch(() => null);

    const text = String(body?.text ?? "").trim();
    const voiceId = String(body?.voiceId ?? body?.voice_id ?? "").trim();
    const modelId = String(body?.modelId ?? body?.model_id ?? "eleven_multilingual_v2").trim();

    // optional (nice defaults)
    const stability = typeof body?.stability === "number" ? body.stability : 0.35;
    const similarityBoost = typeof body?.similarityBoost === "number" ? body.similarityBoost : 0.85;

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400, headers });
    }
    if (!voiceId) {
      return NextResponse.json({ error: "Missing voiceId" }, { status: 400, headers });
    }

    // ✅ Create job record (worker will process with ElevenLabs)
    const { data, error } = await supabaseAdmin
      .from("voice_jobs")
      .insert({
        status: "queued",
        text,
        voice_id: voiceId,
        model_id: modelId,
        settings: {
          stability,
          similarity_boost: similarityBoost,
        },
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("❌ voice_jobs insert error:", error);
      return NextResponse.json({ error: "DB insert failed", details: error.message }, { status: 500, headers });
    }

    return NextResponse.json(
      { ok: true, jobId: data.id, status: "queued" },
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error("❌ /api/voice error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Internal error", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
