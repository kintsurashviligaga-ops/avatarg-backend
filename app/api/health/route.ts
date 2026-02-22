import { getBackendEnvStatus, shortVersion } from '@/lib/env';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { checkMemoryConnectivity } from '@/lib/memory/store';
import { redisPing } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const env = getBackendEnvStatus();
  const [redis, memory] = await Promise.all([
    redisPing({ strict: false }),
    checkMemoryConnectivity(),
  ]);

  const ok = redis.ok && memory.ok;

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
        memory,
      },
      env,
    },
    {
      status: 200,
      headers: jsonHeadersWithRequestId(requestId, { 'Cache-Control': 'no-store' }),
    }
  );
}
