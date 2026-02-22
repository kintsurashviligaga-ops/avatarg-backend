import { getPlanDefinition, type PlanTier, type RouteGroup } from '@/lib/config/plans';
import { redisPipeline } from '@/lib/redis';

type RateLimitResult = {
  ok: boolean;
  retryAfterSec: number;
  limit: number;
  remaining: number;
  current: number;
  source: 'redis' | 'memory';
};

type MemoryEntry = {
  count: number;
  resetAtMs: number;
};

const memoryWindow = new Map<string, MemoryEntry>();

function cleanupMemory(nowMs: number): void {
  for (const [key, value] of memoryWindow.entries()) {
    if (value.resetAtMs <= nowMs) {
      memoryWindow.delete(key);
    }
  }
}

function memoryLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const nowMs = Date.now();
  cleanupMemory(nowMs);
  const existing = memoryWindow.get(key);

  if (!existing || existing.resetAtMs <= nowMs) {
    memoryWindow.set(key, { count: 1, resetAtMs: nowMs + windowSec * 1000 });
    return {
      ok: true,
      retryAfterSec: 0,
      limit,
      current: 1,
      remaining: Math.max(0, limit - 1),
      source: 'memory',
    };
  }

  existing.count += 1;
  const over = existing.count > limit;
  return {
    ok: !over,
    retryAfterSec: over ? Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000)) : 0,
    limit,
    current: existing.count,
    remaining: Math.max(0, limit - existing.count),
    source: 'memory',
  };
}

export async function enforceTierRateLimit(input: {
  userId: string;
  tier: PlanTier;
  routeGroup: RouteGroup;
  windowSec?: number;
}): Promise<RateLimitResult> {
  const windowSec = Math.max(1, input.windowSec || 60);
  const limit = getPlanDefinition(input.tier).rateLimitPerMinute[input.routeGroup];
  const key = `rl:tier:${input.routeGroup}:${input.tier}:${input.userId}`;

  try {
    const payload = await redisPipeline(
      [
        ['INCR', key],
        ['EXPIRE', key, windowSec, 'NX'],
        ['TTL', key],
      ],
      { strict: false }
    );

    if (!payload) {
      return memoryLimit(key, limit, windowSec);
    }

    const current = Number(payload?.[0]?.result || 0);
    const ttl = Number(payload?.[2]?.result || 0);
    const ok = current <= limit;
    return {
      ok,
      retryAfterSec: ok ? 0 : Math.max(1, ttl || 1),
      limit,
      current,
      remaining: Math.max(0, limit - current),
      source: 'redis',
    };
  } catch {
    return memoryLimit(key, limit, windowSec);
  }
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset-After': String(result.retryAfterSec),
    ...(result.retryAfterSec > 0 ? { 'Retry-After': String(result.retryAfterSec) } : {}),
  };
}
