import '@/lib/bootstrap';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { getDashboardMetrics } from '@/lib/observability/redisMetrics';
import { redisPing } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  const [redis, dashboard] = await Promise.all([
    redisPing({ strict: false }),
    getDashboardMetrics(),
  ]);

  return Response.json(
    {
      ok: redis.ok,
      redis_enabled: redis.enabled,
      redis_ping_ok: redis.ok,
      redis_latency_ms: redis.latencyMs,
      dashboard,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
    },
    { status: redis.ok ? 200 : 503, headers: jsonHeadersWithRequestId(requestId, { 'Cache-Control': 'no-store' }) }
  );
}