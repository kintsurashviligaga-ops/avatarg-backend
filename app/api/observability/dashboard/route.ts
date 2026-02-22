import '@/lib/bootstrap';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { isAdminRequest } from '@/lib/observability/adminAuth';
import { getDashboardMetrics } from '@/lib/observability/redisMetrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  if (!isAdminRequest(req)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403, headers: jsonHeadersWithRequestId(requestId) });
  }

  const dashboard = await getDashboardMetrics();
  return Response.json(
    {
      ok: true,
      dashboard,
      generated_at: new Date().toISOString(),
    },
    { status: 200, headers: jsonHeadersWithRequestId(requestId, { 'Cache-Control': 'no-store' }) }
  );
}