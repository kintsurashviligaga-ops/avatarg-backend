import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TARGET = 'https://avatarg-backend.vercel.app/api/pentagon';

// ✅ Keep this strict: only absolute http(s) URLs allowed
function pickTarget() {
  const env = process.env.PENTAGON_BACKEND_URL?.trim();
  return env && /^https?:\/\//i.test(env) ? env : DEFAULT_TARGET;
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

function getOrigin(req: Request) {
  // Some requests have no origin in server-to-server calls
  return req.headers.get('origin') || '*';
}

function corsHeaders(req: Request) {
  const origin = getOrigin(req);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, apikey',
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'no-store',
  } as Record<string, string>;
}

// ✅ Preflight
export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// ✅ Health check endpoint for UI ("Endpoint Check")
export async function GET(req: Request) {
  const target = pickTarget();
  return NextResponse.json(
    {
      ok: true,
      route: '/api/pentagon',
      upstream: target,
      methods: ['POST'],
      note: 'Local proxy endpoint ready (CORS-safe)',
      ts: new Date().toISOString(),
    },
    { headers: corsHeaders(req) }
  );
}

export async function POST(req: Request) {
  const target = pickTarget();

  try {
    // ✅ Loop protection: if someone sets target to THIS SAME app domain, stop immediately
    const host = req.headers.get('host') || '';
    if (host && target.includes(host)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Proxy loop detected: PENTAGON_BACKEND_URL points to the same frontend domain. Set it to the BACKEND domain only.',
          target,
          host,
        },
        { status: 508, headers: corsHeaders(req) }
      );
    }

    // Keep raw body (works for JSON; avoids double-parse issues)
    const body = await req.text();

    // Forward only safe/useful headers
    const incoming = req.headers;
    const headers: Record<string, string> = {
      'Content-Type': incoming.get('content-type') || 'application/json',
      Accept: incoming.get('accept') || 'application/json',
      'Cache-Control': 'no-store',
      // Trace headers (safe)
      'x-proxy': 'avatar-g-frontend',
      'x-forwarded-at': new Date().toISOString(),
    };

    // Forward auth headers if present
    const authorization = incoming.get('authorization');
    if (authorization) headers.Authorization = authorization;

    const apiKey = incoming.get('x-api-key');
    if (apiKey) headers['x-api-key'] = apiKey;

    const apikey = incoming.get('apikey');
    if (apikey) headers.apikey = apikey;

    // ✅ Timeout (video pipeline can be slow)
    const { controller, cleanup } = withTimeout(120_000);

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

    // If upstream returns JSON, ensure we return JSON too
    const parsed = safeJson(text);
    const isJson = ct.includes('application/json') || parsed !== null;

    const outBody = isJson ? JSON.stringify(parsed ?? {}) : text;

    return new NextResponse(outBody, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders(req),
        'Content-Type': isJson
          ? 'application/json; charset=utf-8'
          : ct || 'text/plain; charset=utf-8',
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
      { status: isAbort ? 504 : 500, headers: corsHeaders(req) }
    );
  }
}
