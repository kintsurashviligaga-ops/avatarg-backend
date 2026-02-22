import { randomUUID } from 'node:crypto';
import { assertRequiredEnv, getAllowedOrigin } from '@/lib/env';
import { logStructured } from '@/lib/logging/logger';
import { normalizeWhatsApp } from '@/lib/messaging/normalize';
import { routeMessage } from '@/lib/messaging/router';
import { getMemoryStore } from '@/lib/memory/store';
import { recordFailureAndAlert } from '@/lib/monitoring/alerts';
import { captureException } from '@/lib/monitoring/errorTracker';
import { recordWebhookError, recordWebhookLatency, recordWebhookRequest } from '@/lib/monitoring/metrics';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { verifyMetaSignature } from '@/lib/security/signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_WINDOW_SEC = 60;
const RATE_MAX_REQUESTS = 60;
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

function getRequiredVerifyToken(): string {
  try {
    return assertRequiredEnv('WHATSAPP_VERIFY_TOKEN');
  } catch {
    console.error('[WhatsApp.Webhook] missing_required_env:WHATSAPP_VERIFY_TOKEN');
    throw new Error('missing_required_env:WHATSAPP_VERIFY_TOKEN');
  }
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


export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  let expectedToken = '';
  try {
    expectedToken = getRequiredVerifyToken();
  } catch {
    return new Response('Server Misconfigured', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders(),
      },
    });
  }

  if (mode === 'subscribe' && token && token === expectedToken) {
    return new Response(challenge ?? '', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders(),
      },
    });
  }

  logStructured('warn', 'whatsapp.verify_failed', {
    mode,
    hasToken: Boolean(token),
  });

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

export async function POST(req: Request): Promise<Response> {
  const requestId = randomUUID();
  const route = '/api/webhooks/whatsapp';
  const method = 'POST';
  const startedAt = Date.now();
  let status = 200;

  recordWebhookRequest('whatsapp');

  if (!isAllowedOrigin(req)) {
    status = 403;
    recordWebhookError('whatsapp');
    logStructured('warn', 'whatsapp.origin_rejected', {
      requestId,
      route,
      method,
      status,
      origin: req.headers.get('origin'),
    });
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders(),
      },
    });
  }

  const rateLimit = await enforceRateLimit({
    route: 'webhooks_whatsapp',
    ip: getRequestIp(req),
    limit: RATE_MAX_REQUESTS,
    windowSec: RATE_WINDOW_SEC,
  });

  if (!rateLimit.ok) {
    status = 429;
    recordWebhookError('whatsapp');
    logStructured('warn', 'whatsapp.rate_limited', {
      requestId,
      route,
      method,
      status,
      retryAfterSec: rateLimit.retryAfterSec,
    });
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
    status = 413;
    recordWebhookError('whatsapp');
    logStructured('warn', 'whatsapp.payload_too_large', {
      requestId,
      route,
      method,
      status,
      payloadBytes: rawBody.length,
    });
    return Response.json(
      { ok: false, error: 'payload_too_large' },
      {
        status: 413,
        headers: corsHeaders(),
      }
    );
  }

  try {
    assertRequiredEnv('META_APP_SECRET');
  } catch {
    status = 500;
    recordWebhookError('whatsapp');
    logStructured('error', 'whatsapp.missing_meta_secret', {
      requestId,
      route,
      method,
      status,
    });
    return Response.json({ ok: false, error: 'server_misconfigured' }, { status });
  }

  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  if (!verifyMetaSignature(rawBody, req.headers, appSecret)) {
    status = 403;
    recordWebhookError('whatsapp');
    logStructured('warn', 'whatsapp.signature_invalid', {
      requestId,
      route,
      method,
      status,
      hasSignature: Boolean(req.headers.get('x-hub-signature-256') || req.headers.get('x-hub-signature')),
    });
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
    status = 400;
    recordWebhookError('whatsapp');
    logStructured('warn', 'whatsapp.invalid_json', { requestId });
    return Response.json({ ok: false, error: 'invalid_json' }, { status, headers: corsHeaders() });
  }

  try {
    const messages = normalizeWhatsApp(payload);
    const store = getMemoryStore();

    for (const msg of messages) {
      await store.saveMessage(msg);
      const decision = routeMessage(msg);
      logStructured('info', 'message_routed', {
        requestId,
        route,
        method,
        status,
        platform: 'whatsapp',
        from: msg.from,
        chatId: msg.chatId,
        messageId: msg.messageId,
        agentName: decision.agentName,
        action: decision.action,
      });
    }

    return Response.json({ ok: true, received: messages.length }, { status, headers: corsHeaders() });
  } catch (error) {
    status = 500;
    recordWebhookError('whatsapp');
    await captureException(error, { requestId, route, method });
    await recordFailureAndAlert({
      requestId,
      route,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json({ ok: false, error: 'internal_error' }, { status, headers: corsHeaders() });
  } finally {
    const latencyMs = Date.now() - startedAt;
    recordWebhookLatency('whatsapp', latencyMs);
    logStructured('info', 'webhook_received', {
      requestId,
      route,
      method,
      status,
      latencyMs,
      platform: 'whatsapp',
    });
  }
}
