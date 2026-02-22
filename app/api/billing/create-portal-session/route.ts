import '@/lib/bootstrap';
import { resolveApiKeyAuth } from '@/lib/auth/apiKeyAuth';
import { getSubscriptionState } from '@/lib/billing/subscriptions';
import { getStripeClient } from '@/lib/billing/stripe';
import { logStructured } from '@/lib/logging/logger';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { buildRateLimitHeaders, enforceTierRateLimit } from '@/lib/security/tierRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const startedAt = Date.now();
  const auth = await resolveApiKeyAuth(req);
  if (!auth) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: jsonHeadersWithRequestId(requestId) });
  }

  const limit = await enforceTierRateLimit({ userId: auth.userId, tier: auth.tier, routeGroup: 'billing_api' });
  if (!limit.ok) {
    return Response.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: jsonHeadersWithRequestId(requestId, buildRateLimitHeaders(limit)) });
  }

  const returnUrl = String(process.env.BILLING_PORTAL_RETURN_URL || '').trim();
  if (!returnUrl) {
    return Response.json({ ok: false, error: 'missing_portal_return_url' }, { status: 500, headers: jsonHeadersWithRequestId(requestId) });
  }

  const sub = await getSubscriptionState(auth.userId);
  if (!sub.stripeCustomerId) {
    return Response.json({ ok: false, error: 'stripe_customer_not_found' }, { status: 404, headers: jsonHeadersWithRequestId(requestId) });
  }

  const stripe = getStripeClient();
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: returnUrl,
  });

  logStructured('info', 'billing.portal.created', {
    requestId,
    route: '/api/billing/create-portal-session',
    status: 200,
    latencyMs: Date.now() - startedAt,
    tier: auth.tier,
  });

  return Response.json({ ok: true, url: portal.url }, { status: 200, headers: jsonHeadersWithRequestId(requestId, buildRateLimitHeaders(limit)) });
}