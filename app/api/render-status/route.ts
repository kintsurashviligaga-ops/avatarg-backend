import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Backend endpoint that knows Supabase
const BACKEND_BASE =
  process.env.RENDER_STATUS_BACKEND_URL ??
  'https://avatarg-backend.vercel.app/api/render-status';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    const target = `${BACKEND_BASE}?jobId=${encodeURIComponent(jobId)}`;

    const res = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-proxy': 'avatar-g-frontend',
      },
      cache: 'no-store',
    });

    const text = await res.text();

    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'render-status proxy failed',
      },
      { status: 500 }
    );
  }
}
