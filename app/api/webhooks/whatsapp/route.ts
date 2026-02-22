import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertRequiredEnv, getAllowedOrigin } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RateRecord = {
  windowStart: number;
  count: number;
};

const rateByIp = new Map<string, RateRecord>();
const dedupeByMessageId = new Map<string, number>();

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120;
const DEDUPE_TTL_MS = 10 * 60_000;
const MAX_PAYLOAD_BYTES = 1_000_000;

function corsHeaders(): HeadersInit {
  const allowedOrigin = getAllowedOrigin();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Hub-Signature-256, Authorization',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return headers;
}

function debugEnabled(): boolean {
  return String(process.env.WHATSAPP_DEBUG || '').trim().toLowerCase() === 'true';
}

function logDebug(message: string, extra?: Record<string, unknown>): void {
  if (!debugEnabled()) {
    return;
  }
  console.info('[WhatsApp.Webhook]', { message, ...(extra || {}) });
}

function timingSafeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function cleanIp(rawIp: string | null): string {
  const fallback = 'unknown';
  if (!rawIp) {
    return fallback;
  }
  return rawIp.trim() || fallback;
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

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!appSecret) {
    return true;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const received = signatureHeader.slice('sha256='.length);
  if (!received) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  return timingSafeEquals(received, expected);
}

function sweepDedupeCache(now: number): void {
  for (const [messageId, expiresAt] of dedupeByMessageId.entries()) {
    if (expiresAt <= now) {
      dedupeByMessageId.delete(messageId);
    }
  }
}

function collectMessageIds(payload: unknown): string[] {
  const root = payload as Record<string, unknown> | null;
  if (!root || !Array.isArray(root.entry)) {
    return [];
  }

  const ids: string[] = [];
  for (const entry of root.entry) {
    const entryObj = entry as Record<string, unknown> | null;
    if (!entryObj || !Array.isArray(entryObj.changes)) {
      continue;
    }

    for (const change of entryObj.changes) {
      const changeObj = change as Record<string, unknown> | null;
      const value = (changeObj?.value || null) as Record<string, unknown> | null;
      if (!value || !Array.isArray(value.messages)) {
        continue;
      }

      for (const message of value.messages) {
        const messageObj = message as Record<string, unknown> | null;
        const id = typeof messageObj?.id === 'string' ? messageObj.id.trim() : '';
        if (id) {
          ids.push(id);
        }
      }
    }
  }

  return ids;
}

function hasRecentDuplicate(messageIds: string[], now: number): boolean {
  for (const id of messageIds) {
    const expiresAt = dedupeByMessageId.get(id);
    if (expiresAt && expiresAt > now) {
      return true;
    }
  }
  return false;
}

function rememberMessageIds(messageIds: string[], now: number): void {
  const expiresAt = now + DEDUPE_TTL_MS;
  for (const id of messageIds) {
    dedupeByMessageId.set(id, expiresAt);
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  let expectedToken = '';

  try {
    expectedToken = assertRequiredEnv('WHATSAPP_VERIFY_TOKEN');
  } catch {
    return new Response('Server Misconfigured', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders(),
      },
    });
  }

  if (mode === 'subscribe' && token && expectedToken && timingSafeEquals(token, expectedToken)) {
    return new Response(challenge ?? '', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders(),
      },
    });
  }

  return new Response('Forbidden', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain',
      ...corsHeaders(),
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function processPayloadSafely(payload: unknown): void {
  try {
    const now = Date.now();
    sweepDedupeCache(now);

    const messageIds = collectMessageIds(payload);
    const isDuplicate = hasRecentDuplicate(messageIds, now);
    if (!isDuplicate) {
      rememberMessageIds(messageIds, now);
    }

    logDebug('payload_processed', {
      timestamp: new Date(now).toISOString(),
      messageCount: messageIds.length,
      messageIds,
      isDuplicate,
    });
  } catch (error) {
    console.error('[WhatsApp.Webhook] process_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function POST(req: Request): Promise<Response> {
  const rateLimit = enforceRateLimit(req);
  if (!rateLimit.ok) {
    logDebug('rate_limit_blocked', { retryAfterSec: rateLimit.retryAfterSec });
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
    return Response.json(
      { ok: false, error: 'payload_too_large' },
      {
        status: 413,
        headers: corsHeaders(),
      }
    );
  }

  const signature = req.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature)) {
    logDebug('signature_verification_failed');
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
    payload = null;
  }

  const contentLength = Number(req.headers.get('content-length') || '0');
  logDebug('inbound', {
    timestamp: new Date().toISOString(),
    hasPayload: Boolean(payload),
    contentLength,
  });

  queueMicrotask(() => processPayloadSafely(payload));

  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: corsHeaders(),
    }
  );
}
