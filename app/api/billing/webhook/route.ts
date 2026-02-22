import '@/lib/bootstrap';
import Stripe from 'stripe';
import {
  claimStripeWebhookEventId,
  findUserIdByStripeCustomerId,
  setSubscriptionState,
  getSubscriptionState,
} from '@/lib/billing/subscriptions';
import { getTierForPriceId, getStripeClient, getStripeWebhookSecret, toSubscriptionStatus } from '@/lib/billing/stripe';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractPriceId(subscription: Stripe.Subscription): string | null {
  const item = subscription.items.data[0];
  return item?.price?.id || null;
}

async function upsertFromSubscription(input: {
  userId: string;
  teamId: string;
  customerId: string;
  subscription: Stripe.Subscription;
}): Promise<void> {
  const status = toSubscriptionStatus(input.subscription.status);
  const priceId = extractPriceId(input.subscription);
  const tier = getTierForPriceId(priceId);
  const currentPeriodEndUnix = Number((input.subscription as unknown as { current_period_end?: number }).current_period_end || 0);
  await setSubscriptionState({
    userId: input.userId,
    teamId: input.teamId,
    tier,
    status,
    stripeCustomerId: input.customerId,
    stripeSubscriptionId: input.subscription.id,
    currentPeriodEnd: currentPeriodEndUnix > 0
      ? new Date(currentPeriodEndUnix * 1000).toISOString()
      : undefined,
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const signature = String(req.headers.get('stripe-signature') || '').trim();
  if (!signature) {
    return Response.json({ ok: false, error: 'missing_signature' }, { status: 400, headers: jsonHeadersWithRequestId(requestId) });
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch {
    return Response.json({ ok: false, error: 'invalid_signature' }, { status: 401, headers: jsonHeadersWithRequestId(requestId) });
  }

  const claimed = await claimStripeWebhookEventId(event.id);
  if (!claimed) {
    return Response.json({ ok: true, duplicate: true }, { status: 200, headers: jsonHeadersWithRequestId(requestId) });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = String(session.metadata?.userId || '').trim();
    const teamId = String(session.metadata?.teamId || userId).trim();
    const customerId = String(session.customer || '').trim();

    if (userId && customerId) {
      const existing = await getSubscriptionState(userId);
      await setSubscriptionState({
        ...existing,
        userId,
        teamId,
        stripeCustomerId: customerId,
        status: existing.status === 'none' ? 'incomplete' : existing.status,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = String(subscription.customer || '').trim();
    if (customerId) {
      const userId = await findUserIdByStripeCustomerId(customerId);
      if (userId) {
        const existing = await getSubscriptionState(userId);
        await upsertFromSubscription({
          userId,
          teamId: existing.teamId,
          customerId,
          subscription,
        });
      }
    }
  }

  return Response.json({ ok: true }, { status: 200, headers: jsonHeadersWithRequestId(requestId) });
}