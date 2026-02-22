import { getBackendEnvStatus, shortVersion } from '@/lib/env';
import { checkMemoryConnectivity } from '@/lib/memory/store';
import { pingRateLimitBackend } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const env = getBackendEnvStatus();
  const [redis, memory] = await Promise.all([pingRateLimitBackend(), checkMemoryConnectivity()]);

  const ok = redis.ok && memory.ok;

  return Response.json(
    {
      ok,
      service: 'avatarg-backend',
      uptime: Math.floor(process.uptime()),
      version: shortVersion(),
      timestamp: new Date().toISOString(),
      checks: {
        redis,
        memory,
      },
      env,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
