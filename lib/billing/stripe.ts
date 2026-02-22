import Stripe from 'stripe';
import { parsePlanTier, type PlanTier } from '@/lib/config/plans';

export function getStripeClient(): Stripe {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) {
    throw new Error('missing_required_env:STRIPE_SECRET_KEY');
  }

  return new Stripe(key);
}

export function getStripeWebhookSecret(): string {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    throw new Error('missing_required_env:STRIPE_WEBHOOK_SECRET');
  }
  return secret;
}

type PriceMap = Record<PlanTier, string | null>;

export function getStripePriceMap(): PriceMap {
  return {
    FREE: null,
    BASIC: String(process.env.STRIPE_PRICE_BASIC || '').trim() || null,
    PREMIUM: String(process.env.STRIPE_PRICE_PREMIUM || '').trim() || null,
    AGENT_G_FULL: String(process.env.STRIPE_PRICE_AGENT_G_FULL || '').trim() || null,
  };
}

export function getPriceIdForTier(tier: PlanTier): string {
  const map = getStripePriceMap();
  const priceId = map[tier];
  if (!priceId) {
    throw new Error(`missing_price_id_for_tier:${tier}`);
  }
  return priceId;
}

export function getTierForPriceId(priceId: string | null | undefined): PlanTier {
  const safe = String(priceId || '').trim();
  const map = getStripePriceMap();
  const match = Object.entries(map).find(([, val]) => val === safe)?.[0];
  if (!match) {
    return 'FREE';
  }
  return parsePlanTier(match);
}

export function toSubscriptionStatus(value: string | null | undefined): 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'none' {
  const status = String(value || '').trim();
  if (status === 'active' || status === 'past_due' || status === 'canceled' || status === 'trialing' || status === 'incomplete') {
    return status;
  }
  return 'none';
}