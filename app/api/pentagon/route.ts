import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TARGET = 'https://avatarg-backend.vercel.app/api/pentagon';

function pickTarget() {
  const env = process.env.PENTAGON_BACKEND_URL?.trim();
  return env && env.startsWith('http') ? env : DEFAULT_TARGET;
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, cleanup: () => clearTimeout(t) };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ✅ Health check endpoint for UI ("Endpoint Check")
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      route: '/api/pentagon',
      upstream: pickTarget(),
      methods: ['POST'],
      note: 'Local proxy endpoint ready (CORS-safe)',
      ts: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

export async function POST(req: Request) {
  const target = pickTarget();

  try {
    // Keep raw body (works for JSON; avoids double-parse issues)
    const body = await req.text();

    // Forward only safe/useful headers
    const incoming = req.headers;
    const headers: Record<string, string> = {
      'Content-Type': incoming.get('content-type') || 'application/json',
      Accept: incoming.get('accept') || 'application/json',
      'Cache-Control': 'no-store',
    };

    // Forward auth headers if present
    const authorization = incoming.get('authorization');
    if (authorization) headers.Authorization = authorization;

    const apiKey = incoming.get('x-api-key');
    if (apiKey) headers['x-api-key'] = apiKey;

    const apikey = incoming.get('apikey');
    if (apikey) headers.apikey = apikey;

    // Trace headers
    headers['x-proxy'] = 'avatar-g-frontend';
    headers['x-forwarded-at'] = new Date().toISOString();

    const { controller, cleanup } = withTimeout(120_000); // 120s
    let upstreamRes: Response;

    try {
      upstreamRes = await fetch(target, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      });
    } finally {
      cleanup();
    }

    const text = await upstreamRes.text();
    const ct = upstreamRes.headers.get('content-type') || '';

    // Try to keep JSON consistent
    const parsed = safeJson(text);
    const isJson = ct.includes('application/json') || parsed !== null;

    return new NextResponse(isJson ? JSON.stringify(parsed ?? {}) : text, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': isJson
          ? 'application/json; charset=utf-8'
          : ct || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';

    return NextResponse.json(
      {
        success: false,
        error: isAbort ? 'Upstream timeout (120s)' : err?.message || 'Proxy failed',
        target,
      },
      { status: isAbort ? 504 : 500 }
    );
  }
      }
