import { getMetricsSnapshot } from '@/lib/monitoring/metrics';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  return Response.json(
    {
      ok: true,
      timestamp: new Date().toISOString(),
      metrics: getMetricsSnapshot(),
    },
    {
      status: 200,
      headers: jsonHeadersWithRequestId(requestId, { 'Cache-Control': 'no-store' }),
    }
  );
}
