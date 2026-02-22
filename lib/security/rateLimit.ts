import { logStructured } from '@/lib/logging/logger';
import { RedisMisconfiguredError, redisPipeline, redisPing } from '@/lib/redis';

type LimitResult = {
  ok: boolean;
  retryAfterSec: number;
  current: number;
  source: 'upstash' | 'memory';
};

type MemoryRecord = {
  count: number;
  resetAt: number;
};

const memoryStore = new Map<string, MemoryRecord>();
let warnedFallback = false;

function cleanupMemory(now: number): void {
  for (const [key, record] of memoryStore.entries()) {
    if (record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}

function memoryLimit(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  cleanupMemory(now);

  const prev = memoryStore.get(key);
  if (!prev || prev.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0, current: 1, source: 'memory' };
  }

  prev.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((prev.resetAt - now) / 1000));
  return {
    ok: prev.count <= limit,
    retryAfterSec: prev.count <= limit ? 0 : retryAfterSec,
    current: prev.count,
    source: 'memory',
  };
}

async function upstashLimit(key: string, limit: number, windowSec: number): Promise<LimitResult> {
  const strict = process.env.NODE_ENV === 'production';

  let payload: Array<{ result?: unknown }> | null = null;
  try {
    payload = await redisPipeline(
      [
        ['INCR', key],
        ['EXPIRE', key, windowSec, 'NX'],
        ['TTL', key],
      ],
      { strict }
    );
  } catch (error) {
    if (error instanceof RedisMisconfiguredError) {
      throw error;
    }

    if (!warnedFallback) {
      warnedFallback = true;
      logStructured('warn', 'rate_limit.upstash_unavailable', { event: 'rate_limiter_fallback' });
    }
    return memoryLimit(key, limit, windowSec * 1000);
  }

  if (!payload) {
    if (!warnedFallback) {
      warnedFallback = true;
      logStructured('warn', 'rate_limit.memory_fallback', { event: 'rate_limiter_fallback' });
    }
    return memoryLimit(key, limit, windowSec * 1000);
  }

  const current = Number(payload?.[0]?.result || 0);
  const ttl = Number(payload?.[2]?.result || 0);
  const retryAfterSec = current > limit ? Math.max(1, ttl) : 0;

  return {
    ok: current <= limit,
    retryAfterSec,
    current,
    source: 'upstash',
  };
}

export async function enforceRateLimit(input: {
  route: string;
  ip: string;
  limit: number;
  windowSec: number;
}): Promise<LimitResult> {
  const key = `rl:${input.route}:${input.ip}`;
  return upstashLimit(key, input.limit, input.windowSec);
}

export async function pingRateLimitBackend(): Promise<{ ok: boolean; mode: 'upstash' | 'memory' }> {
  const ping = await redisPing({ strict: false });
  return {
    ok: ping.ok,
    mode: ping.enabled ? 'upstash' : 'memory',
  };
}
