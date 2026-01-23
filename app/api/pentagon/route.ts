import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function makeJobId() {
  return `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: 'SUPABASE_URL ან SUPABASE_SERVICE_ROLE_KEY არ არის დაყენებული backend env-ში.' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const userPrompt = String(body?.userPrompt || '').trim();
    const constraints = body?.constraints || {};

    if (!userPrompt) {
      return NextResponse.json({ success: false, error: 'userPrompt is required' }, { status: 400 });
    }

    const maxScenes = clamp(Number(constraints?.maxScenes ?? 5), 1, 12);
    const maxDurationSec = clamp(Number(constraints?.maxDurationSec ?? 15), 5, 180);

    const jobId = makeJobId();

    // 1) Create job row
    const { error: insertErr } = await supabase.from('render_jobs').insert({
      id: jobId,
      status: 'queued',
      progress: 0,
      final_video_url: null,
      error: null,
    });

    if (insertErr) {
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
    }

    // 2) IMPORTANT:
    // Vercel serverless ვერ აკეთებს “ბექგრაუნდ worker”-ს საიმედოდ ამავე request-ში დიდი ხნით.
    // მაგრამ polling-ს დასატესტად ვაკეთებთ "მოკლე სიმულაციას":
    // - პირველივე წამებში ვწერთ processing/progress
    // - მერე ვწერთ completed + final url
    //
    // როცა რეალურ pipeline-ს ჩასვამ,
    // აქედან უბრალოდ დააბრუნე jobId და დანარჩენს გააკეთებს worker/queue.

    // Quick simulate progress updates (fire-and-forget style; may not always run, but often enough for test)
    Promise.resolve()
      .then(async () => {
        await supabase.from('render_jobs').update({ status: 'processing', progress: 15 }).eq('id', jobId);
        await new Promise((r) => setTimeout(r, 1200));

        await supabase.from('render_jobs').update({ status: 'rendering', progress: 55 }).eq('id', jobId);
        await new Promise((r) => setTimeout(r, 1200));

        await supabase.from('render_jobs').update({ status: 'uploading', progress: 85 }).eq('id', jobId);
        await new Promise((r) => setTimeout(r, 1000));

        // საბოლოო URL — ახლა mock
        const finalUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';

        await supabase
          .from('render_jobs')
          .update({ status: 'completed', progress: 100, final_video_url: finalUrl })
          .eq('id', jobId);
      })
      .catch(async (e) => {
        await supabase
          .from('render_jobs')
          .update({ status: 'error', error: e?.message || String(e) })
          .eq('id', jobId);
      });

    // 3) Return job id (frontend will poll /api/render-status)
    return NextResponse.json({
      success: true,
      renderJobId: jobId,
      accepted: true,
      constraints: { maxScenes, maxDurationSec },
      note: 'Job queued. Poll /api/render-status?jobId=... for progress.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
