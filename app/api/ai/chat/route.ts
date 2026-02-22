import '@/lib/bootstrap';
import { resolveApiKeyAuth } from '@/lib/auth/apiKeyAuth';
import { getEntitlements } from '@/lib/billing/entitlements';
import { enforceUsageOrThrow, incrementUsage, UsageLimitExceededError } from '@/lib/billing/usage';
import { executeAiWithFallback } from '@/lib/ai/providers';
import { routeAiRequest, type AiTaskType } from '@/lib/ai/router';
import { logStructured } from '@/lib/logging/logger';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { recordAiCallMetric, recordApiErrorMetric } from '@/lib/monitoring/metrics';
import { buildRateLimitHeaders, enforceTierRateLimit } from '@/lib/security/tierRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatBody = {
  taskType?: AiTaskType;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
};

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  const auth = await resolveApiKeyAuth(req);
  if (!auth) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: jsonHeadersWithRequestId(requestId) });
  }

  const limit = await enforceTierRateLimit({
    userId: auth.userId,
    tier: auth.tier,
    routeGroup: 'ai_api',
  });

  if (!limit.ok) {
    return Response.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: jsonHeadersWithRequestId(requestId, buildRateLimitHeaders(limit)) }
    );
  }

  const body = (await req.json().catch(() => null)) as ChatBody | null;
  const taskType = (body?.taskType || 'chat') as AiTaskType;
  const messages = Array.isArray(body?.messages) ? body?.messages : [];
  if (messages.length === 0) {
    return Response.json({ ok: false, error: 'missing_messages' }, { status: 400, headers: jsonHeadersWithRequestId(requestId) });
  }

  try {
    await enforceUsageOrThrow(auth.userId, auth.tier, 'ai_calls');
  } catch (error) {
    if (error instanceof UsageLimitExceededError) {
      return Response.json(
        { ok: false, error: 'usage_limit_exceeded', metric: error.metric, used: error.used, limit: error.limit },
        { status: 402, headers: jsonHeadersWithRequestId(requestId) }
      );
    }
    throw error;
  }

  const route = routeAiRequest(
    {
      taskType,
      requestedModel: body?.model,
      maxTokens: body?.maxTokens,
      temperature: body?.temperature,
    },
    {
      requestId,
      userId: auth.userId,
      tier: auth.tier,
    }
  );

  let aiResult;
  try {
    aiResult = await executeAiWithFallback({
      fallbackChain: route.fallbackChain,
      messages,
      maxTokens: route.maxTokens,
      temperature: route.temperature,
    });
  } catch {
    recordApiErrorMetric();
    return Response.json({ ok: false, error: 'ai_unavailable' }, { status: 503, headers: jsonHeadersWithRequestId(requestId) });
  }

  await Promise.all([
    incrementUsage(auth.userId, 'ai_calls', 1),
    incrementUsage(auth.userId, 'tokens', Math.max(1, aiResult.usageTokens)),
  ]);
  recordAiCallMetric();

  const entitlements = await getEntitlements(auth.userId);

  logStructured('info', 'ai.chat.completed', {
    requestId,
    route: '/api/ai/chat',
    status: 200,
    latencyMs: Date.now() - startedAt,
    tier: auth.tier,
    provider: aiResult.provider,
    model: aiResult.model,
    fallbackUsed: aiResult.fallbackUsed,
  });

  return Response.json(
    {
      ok: true,
      request_id: requestId,
      route,
      result: {
        provider: aiResult.provider,
        model: aiResult.model,
        content: aiResult.content,
        usageTokens: aiResult.usageTokens,
      },
      entitlements: {
        tier: entitlements.tier,
        remaining: entitlements.remaining,
      },
    },
    { status: 200, headers: jsonHeadersWithRequestId(requestId, buildRateLimitHeaders(limit)) }
  );
}