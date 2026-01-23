import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Constraints = {
  maxScenes?: number;
  maxDurationSec?: number;
  style?: string;
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function safeJson<T = any>(req: Request): Promise<T | null> {
  return req
    .json()
    .then((v) => v as T)
    .catch(() => null);
}

function corsHeaders(req: Request) {
  // allow same-origin + local dev + vercel previews
  const origin = req.headers.get('origin') || '*';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const headers = corsHeaders(req);

  try {
    const body = await safeJson<{
      userPrompt?: string;
      constraints?: Constraints;
    }>(req);

    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400, headers }
      );
    }

    const userPrompt = String(body.userPrompt || '').trim();
    if (!userPrompt) {
      return NextResponse.json(
        { success: false, error: 'userPrompt is required' },
        { status: 400, headers }
      );
    }

    const constraintsIn = body.constraints || {};
    const maxScenes = clamp(Number(constraintsIn.maxScenes ?? 5), 1, 12);
    const maxDurationSec = clamp(Number(constraintsIn.maxDurationSec ?? 15), 5, 180);
    const style =
      String(constraintsIn.style || '').trim() ||
      'cinematic, professional, 4K, beautiful lighting';

    // ✅ აქედან ქვემოთ: ახლა არის MOCK / TEST
    // ⛳ როცა რეალურ pipeline-ს ჩასვამ:
    // 1) generate structure → localization → voiceover → visuals → render
    // 2) ჩაწერე render_jobs (Supabase) და დააბრუნე renderJobId
    // 3) completed-ზე finalVideoUrl იქნება რეალური MP4 (Storage/CDN)

    const renderJobId = `test-job-${Date.now()}`;

    // 🚧 MOCK timings (თითქოს pipeline გაიარა)
    const meta = {
      stageTimingsMs: {
        structure: 500,
        localization: 800,
        voiceover: 1200,
        visuals: 1500,
        render: 2000,
      },
      constraintsUsed: { maxScenes, maxDurationSec, style },
    };

    return NextResponse.json(
      {
        success: true,
        renderJobId,
        finalVideoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
        meta,
      },
      { status: 200, headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal server error',
      },
      { status: 500, headers }
    );
  }
}
