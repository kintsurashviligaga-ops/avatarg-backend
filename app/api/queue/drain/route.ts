import '@/lib/bootstrap';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { drainQueues } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const adminKey = String(process.env.ADMIN_API_KEY || '').trim();
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const providedAdmin = String(req.headers.get('x-admin-api-key') || '').trim();
  const providedCron = String(req.headers.get('x-cron-secret') || '').trim();
  return Boolean((adminKey && providedAdmin === adminKey) || (cronSecret && providedCron === cronSecret));
}

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403, headers: jsonHeadersWithRequestId(requestId) });
  }

  const body = (await req.json().catch(() => null)) as { limit?: number } | null;
  const result = await drainQueues({
    requestId,
    limit: body?.limit,
  });

  return Response.json(
    {
      ok: true,
      request_id: requestId,
      ...result,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: jsonHeadersWithRequestId(requestId) }
  );
}