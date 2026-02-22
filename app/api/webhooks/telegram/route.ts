import crypto from 'node:crypto';
import { getAllowedOrigin } from '@/lib/env';
import { logStructured } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RateRecord = { windowStart: number; count: number };

const rateByIp = new Map<string, RateRecord>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120;
const MAX_PAYLOAD_BYTES = 1_000_000;

function corsHeaders(): HeadersInit {
  const allowedOrigin = getAllowedOrigin();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token, Authorization',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return headers;
}

function cleanIp(rawIp: string | null): string {
  if (!rawIp) {
    return 'unknown';
  }
  return rawIp.trim() || 'unknown';
}

function getRequestIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim() || null;
    return cleanIp(first);
  }
  return cleanIp(req.headers.get('x-real-ip'));
}

function enforceRateLimit(req: Request): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const ip = getRequestIp(req);
  const record = rateByIp.get(ip);

  if (!record || now - record.windowStart >= RATE_WINDOW_MS) {
    rateByIp.set(ip, { windowStart: now, count: 1 });
    return { ok: true };
  }

  if (record.count >= RATE_MAX_REQUESTS) {
    const retryAfterSec = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - record.windowStart)) / 1000));
    return { ok: false, retryAfterSec };
  }

  record.count += 1;
  return { ok: true };
}

function isAllowedOrigin(req: Request): boolean {
  const requestOrigin = String(req.headers.get('origin') || '').trim();
  if (!requestOrigin) {
    return true;
  }

  const allowedOrigin = getAllowedOrigin();
  if (!allowedOrigin) {
    return true;
  }

  return requestOrigin === allowedOrigin;
}

function hasValidTelegramSecret(req: Request): boolean {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!expected) {
    return true;
  }

  const provided = String(req.headers.get('x-telegram-bot-api-secret-token') || '').trim();
  return Boolean(provided && provided === expected);
}

function queueTelegramProcessing(payload: unknown, requestId: string): void {
  queueMicrotask(() => {
    try {
      const root = payload as Record<string, unknown> | null;
      const updateId = typeof root?.update_id === 'number' ? root.update_id : null;
      const message = (root?.message || null) as Record<string, unknown> | null;
      const chat = (message?.chat || null) as Record<string, unknown> | null;
      const chatId = chat?.id ?? null;

      logStructured('info', 'telegram.webhook_processed', {
        requestId,
        updateId,
        chatId,
      });
    } catch (error) {
      logStructured('error', 'telegram.webhook_processing_failed', {
        requestId,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function POST(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();

  if (!isAllowedOrigin(req)) {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders(),
      },
    });
  }

  const rateLimit = enforceRateLimit(req);
  if (!rateLimit.ok) {
    return Response.json(
      { ok: false, error: 'rate_limited' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSec),
          ...corsHeaders(),
        },
      }
    );
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return Response.json({ ok: false, error: 'payload_too_large' }, { status: 413, headers: corsHeaders() });
  }

  if (!hasValidTelegramSecret(req)) {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders(),
      },
    });
  }

  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    logStructured('warn', 'telegram.invalid_json', { requestId });
    return Response.json({ ok: true }, { status: 200, headers: corsHeaders() });
  }

  logStructured('info', 'telegram.inbound_received', {
    requestId,
    payloadPresent: Boolean(payload),
  });

  queueTelegramProcessing(payload, requestId);

  return Response.json({ ok: true }, { status: 200, headers: corsHeaders() });
}
