import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'missing_job_id' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('music_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return NextResponse.json(
        { ok: false, error: 'job_not_found', details: error.message },
        { status: 404 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: 'job_empty' },
        { status: 404 }
      );
    }

    // ✅ compatibility: job + result
    return NextResponse.json({
      ok: true,
      job: data,
      result: data,
    });

  } catch (err: any) {
    console.error('🔥 STATUS API CRASH:', err);
    return NextResponse.json(
      {
        ok: false,
        error: 'internal_error',
        message: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
