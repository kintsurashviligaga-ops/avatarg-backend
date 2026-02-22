import { logStructured } from '@/lib/logging/logger';

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

function getRedisConfig(): { url: string; token: string } | null {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();

  if (!url || !token) {
    return null;
  }

  return { url: url.replace(/\/$/, ''), token };
}

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
  const config = getRedisConfig();
  if (!config) {
    if (!warnedFallback) {
      warnedFallback = true;
      logStructured('warn', 'rate_limit.memory_fallback', { event: 'rate_limiter_fallback' });
    }

    return memoryLimit(key, limit, windowSec * 1000);
  }

  const pipelineUrl = `${config.url}/pipeline`;
  const body = JSON.stringify([
    ['INCR', key],
    ['EXPIRE', key, windowSec, 'NX'],
    ['TTL', key],
  ]);

  const response = await fetch(pipelineUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (!warnedFallback) {
      warnedFallback = true;
      logStructured('warn', 'rate_limit.upstash_unavailable', {
        status: response.status,
        event: 'rate_limiter_fallback',
      });
    }
    return memoryLimit(key, limit, windowSec * 1000);
  }

  const payload = (await response.json().catch(() => null)) as Array<{ result?: number }> | null;
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
  const config = getRedisConfig();
  if (!config) {
    return { ok: true, mode: 'memory' };
  }

  const response = await fetch(`${config.url}/ping`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.token}` },
    cache: 'no-store',
  });

  return { ok: response.ok, mode: 'upstash' };
}
