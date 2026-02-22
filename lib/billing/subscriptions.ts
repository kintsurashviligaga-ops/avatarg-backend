import { parsePlanTier, type PlanTier } from '@/lib/config/plans';
import { redisGet, redisSetNxWithTtl, redisPipeline } from '@/lib/redis';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'none';

export type SubscriptionState = {
  userId: string;
  teamId: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  updatedAt: string;
};

function redisKey(userId: string): string {
  return `billing:sub:${userId}`;
}

function customerMapKey(customerId: string): string {
  return `billing:customer:${customerId}`;
}

function parseState(raw: string | null, fallbackUserId: string): SubscriptionState {
  if (!raw) {
    return {
      userId: fallbackUserId,
      teamId: fallbackUserId,
      tier: 'FREE',
      status: 'none',
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const parsed = JSON.parse(raw) as SubscriptionState;
    return {
      ...parsed,
      tier: parsePlanTier(parsed.tier),
    };
  } catch {
    return {
      userId: fallbackUserId,
      teamId: fallbackUserId,
      tier: 'FREE',
      status: 'none',
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function getSubscriptionState(userId: string): Promise<SubscriptionState> {
  const result = await redisGet(redisKey(userId), { strict: false });
  if (!result.ok || !result.enabled) {
    return parseState(null, userId);
  }
  return parseState(result.value, userId);
}

export async function setSubscriptionState(state: SubscriptionState): Promise<void> {
  const key = redisKey(state.userId);
  const payload = JSON.stringify({
    ...state,
    updatedAt: new Date().toISOString(),
  });

  await redisPipeline(
    [
      ['SET', key, payload],
      ['EXPIRE', key, 60 * 60 * 24 * 90],
      ...(state.stripeCustomerId
        ? [
            ['SET', customerMapKey(state.stripeCustomerId), state.userId],
            ['EXPIRE', customerMapKey(state.stripeCustomerId), 60 * 60 * 24 * 365],
          ]
        : []),
    ],
    { strict: false }
  );
}

export async function findUserIdByStripeCustomerId(customerId: string): Promise<string | null> {
  const result = await redisGet(customerMapKey(customerId), { strict: false });
  if (!result.ok || !result.enabled) {
    return null;
  }
  return result.value || null;
}

export async function claimStripeWebhookEventId(eventId: string): Promise<boolean> {
  const key = stripeWebhookIdempotencyKey(eventId);
  const result = await redisSetNxWithTtl(key, '1', 60 * 60 * 24 * 7, { strict: false });
  return Boolean(result.value);
}

export function stripeWebhookIdempotencyKey(eventId: string): string {
  return `idemp:stripe:webhook:${eventId}`;
}