import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  // ❗️არასდროს throw import-time-ზე — რომ build არ გატყდეს
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function badRequest(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'SUPABASE_URL ან SUPABASE_SERVICE_ROLE_KEY არ არის დაყენებული backend env-ში.' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId') || searchParams.get('renderJobId');

  if (!jobId) return badRequest('jobId is required. Example: /api/render-status?jobId=job_123');

  const { data, error } = await supabase
    .from('render_jobs')
    .select('id,status,progress,final_video_url,error,created_at,updated_at')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: 'Job not found', renderJobId: jobId }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    renderJobId: data.id,
    status: data.status,
    progress: data.progress,
    finalVideoUrl: data.final_video_url || null,
    error: data.error || null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}
