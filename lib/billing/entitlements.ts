import { getPlanDefinition, type PlanTier } from '@/lib/config/plans';
import { getSubscriptionState } from '@/lib/billing/subscriptions';
import { getUsage } from '@/lib/billing/usage';

export type Entitlements = {
  userId: string;
  teamId: string;
  tier: PlanTier;
  status: string;
  plan: ReturnType<typeof getPlanDefinition>;
  usage: Awaited<ReturnType<typeof getUsage>>;
  remaining: {
    monthlyMessages: number;
    dailyAiCalls: number;
    monthlyTokens: number;
    monthlyJobMinutes: number;
  };
};

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [sub, usage] = await Promise.all([getSubscriptionState(userId), getUsage(userId)]);
  const plan = getPlanDefinition(sub.tier);

  return {
    userId,
    teamId: sub.teamId,
    tier: sub.tier,
    status: sub.status,
    plan,
    usage,
    remaining: {
      monthlyMessages: Math.max(0, plan.limits.monthlyMessages - usage.metrics.messages),
      dailyAiCalls: Math.max(0, plan.limits.dailyAiCalls - usage.metrics.ai_calls),
      monthlyTokens: Math.max(0, plan.limits.monthlyTokens - usage.metrics.tokens),
      monthlyJobMinutes: Math.max(0, plan.limits.monthlyJobMinutes - usage.metrics.job_minutes),
    },
  };
}