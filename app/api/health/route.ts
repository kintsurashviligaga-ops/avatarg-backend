import '@/lib/bootstrap';
import { getBackendEnvStatus, shortVersion } from '@/lib/env';
import { OPTIONAL_ENV_NAMES, REQUIRED_ENV_NAMES, isTelegramEnabled } from '@/lib/env';
import { logStructured } from '@/lib/logging/logger';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { checkMemoryConnectivity } from '@/lib/memory/store';
import { redisPing } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const startedAt = Date.now();
  const env = getBackendEnvStatus();
  const [redis, memory] = await Promise.all([
    redisPing({ strict: false }),
    checkMemoryConnectivity(),
  ]);

  const required = [...REQUIRED_ENV_NAMES, ...(isTelegramEnabled() ? (['TELEGRAM_BOT_TOKEN'] as const) : [])];
  const optional = OPTIONAL_ENV_NAMES;
  const requiredMissing = required.filter((name) => !env[name]);
  const optionalMissing = optional.filter((name) => !env[name]);
  const envIntegrity = {
    requiredOk: requiredMissing.length === 0,
    requiredMissing,
    optionalMissing,
  };

  const ok = redis.ok && memory.ok && redis.enabled && envIntegrity.requiredOk;
  const status = ok ? 200 : 503;
  const latencyMs = Date.now() - startedAt;

  logStructured(ok ? 'info' : 'warn', 'health_check', {
    message: 'health_check',
    requestId,
    latencyMs,
    redisEnabled: redis.enabled,
    redisOk: redis.ok,
    status,
    route: '/api/health',
    method: 'GET',
  });

  return Response.json(
    {
      ok,
      service: 'avatarg-backend',
      uptime: Math.floor(process.uptime()),
      version: shortVersion(),
      timestamp: new Date().toISOString(),
      checks: {
        redis: {
          ok: redis.ok,
          enabled: redis.enabled,
          latencyMs: redis.latencyMs,
          ...(redis.missing ? { missing: redis.missing } : {}),
        },
        supabase: {
          ok: memory.ok,
          mode: memory.mode,
        },
        memory,
      },
      envIntegrity,
      env,
    },
    {
      status,
      headers: jsonHeadersWithRequestId(requestId, { 'Cache-Control': 'no-store' }),
    }
  );
}
