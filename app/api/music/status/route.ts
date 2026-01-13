import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type JobRow = {
  id: string;
  status: "queued" | "processing" | "done" | "error" | string;
  public_url: string | null;
  filename: string | null;
  error_message: string | null;
  updated_at: string | null;
};

function corsHeaders(origin?: string | null) {
  const allowed = process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "*";
  const o = origin || "";

  // ✅ If you keep "*", do NOT use credentials
  const allowOrigin = allowed === "*" ? "*" : allowed;

  return {
    "Access-Control-Allow-Origin": allowOrigin === "*" ? "*" : o || allowOrigin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

// ✅ cache admin client (avoid recreate each request)
let _admin: SupabaseClient | null = null;

function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function GET(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing ?id=JOB_ID" },
        { status: 400, headers }
      );
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("music_jobs")
      .select("id,status,public_url,filename,error_message,updated_at")
      .eq("id", id)
      .maybeSingle<JobRow>();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Job not found", id },
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
          updatedAt: data.updated_at,
        },
      },
      { status: 200, headers }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500, headers }
    );
  }
}
