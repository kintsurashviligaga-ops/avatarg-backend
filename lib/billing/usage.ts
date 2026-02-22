import { getPlanDefinition, type PlanTier } from '@/lib/config/plans';
import { redisPipeline, redisGet } from '@/lib/redis';

export type UsageMetric = 'messages' | 'ai_calls' | 'tokens' | 'job_minutes';

export type UsageSnapshot = {
  month: string;
  day: string;
  metrics: Record<UsageMetric, number>;
};

function currentMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentDayKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function usageKey(month: string, userId: string, metric: UsageMetric): string {
  return `usage:${month}:${userId}:${metric}`;
}

function usageDayKey(day: string, userId: string, metric: UsageMetric): string {
  return `usage_day:${day}:${userId}:${metric}`;
}

function monthTtlSec(): number {
  return 60 * 60 * 24 * 62;
}

function dayTtlSec(): number {
  return 60 * 60 * 24 * 3;
}

export async function incrementUsage(userId: string, metric: UsageMetric, amount: number): Promise<number> {
  const safeAmount = Math.max(0, Math.floor(amount));
  if (safeAmount === 0) {
    return 0;
  }

  const month = currentMonthKey();
  const day = currentDayKey();
  const monthKey = usageKey(month, userId, metric);
  const dayKey = usageDayKey(day, userId, metric);
  const payload = await redisPipeline(
    [
      ['INCRBY', monthKey, safeAmount],
      ['EXPIRE', monthKey, monthTtlSec(), 'NX'],
      ['INCRBY', dayKey, safeAmount],
      ['EXPIRE', dayKey, dayTtlSec(), 'NX'],
    ],
    { strict: false }
  );

  return Number(payload?.[0]?.result || 0);
}

async function getMetric(userId: string, metric: UsageMetric): Promise<{ month: number; day: number }> {
  const month = currentMonthKey();
  const day = currentDayKey();
  const monthRes = await redisGet(usageKey(month, userId, metric), { strict: false });
  const dayRes = await redisGet(usageDayKey(day, userId, metric), { strict: false });
  return {
    month: Number(monthRes.value || 0),
    day: Number(dayRes.value || 0),
  };
}

export async function getUsage(userId: string): Promise<UsageSnapshot> {
  const [messages, aiCalls, tokens, jobMinutes] = await Promise.all([
    getMetric(userId, 'messages'),
    getMetric(userId, 'ai_calls'),
    getMetric(userId, 'tokens'),
    getMetric(userId, 'job_minutes'),
  ]);

  return {
    month: currentMonthKey(),
    day: currentDayKey(),
    metrics: {
      messages: messages.month,
      ai_calls: aiCalls.day,
      tokens: tokens.month,
      job_minutes: jobMinutes.month,
    },
  };
}

export class UsageLimitExceededError extends Error {
  metric: UsageMetric;
  limit: number;
  used: number;

  constructor(metric: UsageMetric, limit: number, used: number) {
    super(`usage_limit_exceeded:${metric}:${used}/${limit}`);
    this.name = 'UsageLimitExceededError';
    this.metric = metric;
    this.limit = limit;
    this.used = used;
  }
}

export async function enforceUsageOrThrow(userId: string, tier: PlanTier, metric: UsageMetric): Promise<void> {
  const usage = await getUsage(userId);
  const plan = getPlanDefinition(tier);

  const limit = metric === 'messages'
    ? plan.limits.monthlyMessages
    : metric === 'ai_calls'
      ? plan.limits.dailyAiCalls
      : metric === 'tokens'
        ? plan.limits.monthlyTokens
        : plan.limits.monthlyJobMinutes;

  const used = usage.metrics[metric];
  if (used >= limit) {
    throw new UsageLimitExceededError(metric, limit, used);
  }
}