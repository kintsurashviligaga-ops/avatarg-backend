import { randomUUID } from 'node:crypto';
import { getAllowedOrigin, getMissingEnvNames } from '@/lib/env';
import { logStructured } from '@/lib/logging/logger';
import { getMemoryStore } from '@/lib/memory/store';
import { normalizeTelegram } from '@/lib/messaging/normalize';
import { routeMessage } from '@/lib/messaging/router';
import { recordFailureAndAlert } from '@/lib/monitoring/alerts';
import { captureException } from '@/lib/monitoring/errorTracker';
import { recordWebhookError, recordWebhookLatency, recordWebhookRequest } from '@/lib/monitoring/metrics';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { RedisMisconfiguredError } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_WINDOW_SEC = 60;
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

export async function GET(): Promise<Response> {
  return Response.json({ ok: true, platform: 'telegram', timestamp: new Date().toISOString() }, { status: 200 });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function POST(req: Request): Promise<Response> {
  const requestId = randomUUID();
  const route = '/api/webhooks/telegram';
  const method = 'POST';
  const startedAt = Date.now();
  let status = 200;

  recordWebhookRequest('telegram');

  const missing = getMissingEnvNames(['TELEGRAM_BOT_TOKEN']);
  if (missing.length > 0) {
    status = 500;
    recordWebhookError('telegram');
    logStructured('error', 'telegram.missing_required_env', {
      requestId,
      route,
      method,
      status,
      missing,
    });
    return Response.json({ error: 'server_misconfigured', missing }, { status });
  }

  if (!isAllowedOrigin(req)) {
    status = 403;
    recordWebhookError('telegram');
    return Response.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders() });
  }

  let rateLimit;
  try {
    rateLimit = await enforceRateLimit({
      route: 'webhooks_telegram',
      ip: getRequestIp(req),
      limit: RATE_MAX_REQUESTS,
      windowSec: RATE_WINDOW_SEC,
    });
  } catch (error) {
    if (error instanceof RedisMisconfiguredError) {
      status = 500;
      recordWebhookError('telegram');
      return Response.json({ error: 'server_misconfigured', missing: error.missing }, { status, headers: corsHeaders() });
    }
    throw error;
  }

  if (!rateLimit.ok) {
    status = 429;
    recordWebhookError('telegram');
    logStructured('warn', 'telegram.rate_limited', {
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
    recordWebhookError('telegram');
    return Response.json({ ok: false, error: 'payload_too_large' }, { status: 413, headers: corsHeaders() });
  }

  if (!hasValidTelegramSecret(req)) {
    status = 403;
    recordWebhookError('telegram');
    logStructured('warn', 'telegram.secret_invalid', {
      requestId,
      route,
      method,
      status,
    });
    return Response.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders() });
  }

  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    status = 400;
    recordWebhookError('telegram');
    logStructured('warn', 'telegram.invalid_json', { requestId });
    return Response.json({ ok: false, error: 'invalid_json' }, { status, headers: corsHeaders() });
  }

  try {
    const messages = normalizeTelegram(payload);
    const store = getMemoryStore();

    for (const msg of messages) {
      await store.saveMessage(msg);
      const decision = routeMessage(msg);
      logStructured('info', 'message_routed', {
        requestId,
        route,
        method,
        status,
        platform: 'telegram',
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
    recordWebhookError('telegram');
    await captureException(error, { requestId, route, method });
    await recordFailureAndAlert({
      requestId,
      route,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json({ ok: false, error: 'internal_error' }, { status, headers: corsHeaders() });
  } finally {
    const latencyMs = Date.now() - startedAt;
    recordWebhookLatency('telegram', latencyMs);
    logStructured('info', 'webhook_received', {
      requestId,
      route,
      method,
      status,
      latencyMs,
      platform: 'telegram',
    });
  }
}
