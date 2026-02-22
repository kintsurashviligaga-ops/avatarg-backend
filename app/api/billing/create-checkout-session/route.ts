import '@/lib/bootstrap';
import { resolveApiKeyAuth } from '@/lib/auth/apiKeyAuth';
import { getPriceIdForTier, getStripeClient } from '@/lib/billing/stripe';
import { parsePlanTier } from '@/lib/config/plans';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const auth = await resolveApiKeyAuth(req);
  if (!auth) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: jsonHeadersWithRequestId(requestId) });
  }

  const body = (await req.json().catch(() => null)) as { tier?: string; successUrl?: string; cancelUrl?: string } | null;
  const tier = parsePlanTier(body?.tier);
  if (tier === 'FREE') {
    return Response.json({ ok: false, error: 'invalid_target_tier' }, { status: 400, headers: jsonHeadersWithRequestId(requestId) });
  }

  const stripe = getStripeClient();
  const price = getPriceIdForTier(tier);
  const successUrl = String(body?.successUrl || process.env.BILLING_SUCCESS_URL || '').trim();
  const cancelUrl = String(body?.cancelUrl || process.env.BILLING_CANCEL_URL || '').trim();
  if (!successUrl || !cancelUrl) {
    return Response.json({ ok: false, error: 'missing_checkout_urls' }, { status: 500, headers: jsonHeadersWithRequestId(requestId) });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: auth.userId,
      teamId: auth.teamId,
      targetTier: tier,
    },
  });

  return Response.json(
    {
      ok: true,
      id: session.id,
      url: session.url,
    },
    { status: 200, headers: jsonHeadersWithRequestId(requestId) }
  );
}