import '@/lib/bootstrap';
import { resolveApiKeyAuth } from '@/lib/auth/apiKeyAuth';
import { getEntitlements } from '@/lib/billing/entitlements';
import { logStructured } from '@/lib/logging/logger';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { buildRateLimitHeaders, enforceTierRateLimit } from '@/lib/security/tierRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const startedAt = Date.now();
  const auth = await resolveApiKeyAuth(req);
  if (!auth) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: jsonHeadersWithRequestId(requestId) }
    );
  }

  const limit = await enforceTierRateLimit({ userId: auth.userId, tier: auth.tier, routeGroup: 'billing_api' });
  if (!limit.ok) {
    return Response.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: jsonHeadersWithRequestId(requestId, buildRateLimitHeaders(limit)) }
    );
  }

  const entitlements = await getEntitlements(auth.userId);
  logStructured('info', 'billing.plan.read', {
    requestId,
    route: '/api/billing/plan',
    status: 200,
    latencyMs: Date.now() - startedAt,
    tier: auth.tier,
  });
  return Response.json(
    {
      ok: true,
      userId: auth.userId,
      teamId: auth.teamId,
      entitlements,
    },
    {
      status: 200,
      headers: jsonHeadersWithRequestId(requestId, { 'Cache-Control': 'no-store', ...buildRateLimitHeaders(limit) }),
    }
  );
}