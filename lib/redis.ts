import { EnvValidationError, requireRuntimeEnv } from '@/lib/env';

export class RedisMisconfiguredError extends Error {
  missing: string[];

  constructor(missing: string[]) {
    super(`redis_misconfigured:${missing.join(',')}`);
    this.name = 'RedisMisconfiguredError';
    this.missing = missing;
  }
}

type RedisCommand = Array<string | number>;

type RedisConfig = {
  url: string;
  token: string;
};

function readRedisConfig(strict: boolean): RedisConfig | null {
  try {
    const values = requireRuntimeEnv(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']);
    return {
      url: values.UPSTASH_REDIS_REST_URL.replace(/\/$/, ''),
      token: values.UPSTASH_REDIS_REST_TOKEN,
    };
  } catch (error) {
    if (error instanceof EnvValidationError) {
      if (strict) {
        throw new RedisMisconfiguredError(error.missing);
      }
      return null;
    }

    throw error;
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 120): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }

      const delay = baseDelayMs * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('redis_request_failed');
}

export async function redisPipeline(commands: RedisCommand[], options: { strict: boolean }): Promise<Array<{ result?: unknown }> | null> {
  const config = readRedisConfig(options.strict);
  if (!config) {
    return null;
  }

  const response = await withRetry(async () => {
    const res = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`redis_http_${res.status}`);
    }

    return res;
  });

  return (await response.json().catch(() => null)) as Array<{ result?: unknown }> | null;
}

export async function redisPing(options: { strict: boolean }): Promise<{ ok: boolean; enabled: boolean; latencyMs: number; missing?: string[] }> {
  const startedAt = Date.now();

  let config: RedisConfig | null;
  try {
    config = readRedisConfig(options.strict);
  } catch (error) {
    if (error instanceof RedisMisconfiguredError) {
      return {
        ok: false,
        enabled: false,
        latencyMs: Date.now() - startedAt,
        missing: error.missing,
      };
    }
    throw error;
  }

  if (!config) {
    return {
      ok: true,
      enabled: false,
      latencyMs: Date.now() - startedAt,
    };
  }

  try {
    const response = await withRetry(async () => {
      const res = await fetch(`${config.url}/ping`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.token}`,
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`redis_ping_${res.status}`);
      }

      return res;
    });

    return {
      ok: response.ok,
      enabled: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      ok: false,
      enabled: true,
      latencyMs: Date.now() - startedAt,
    };
  }
}
