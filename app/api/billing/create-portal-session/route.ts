import '@/lib/bootstrap';
import { resolveApiKeyAuth } from '@/lib/auth/apiKeyAuth';
import { getSubscriptionState } from '@/lib/billing/subscriptions';
import { getStripeClient } from '@/lib/billing/stripe';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const auth = await resolveApiKeyAuth(req);
  if (!auth) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: jsonHeadersWithRequestId(requestId) });
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

  return Response.json({ ok: true, url: portal.url }, { status: 200, headers: jsonHeadersWithRequestId(requestId) });
}