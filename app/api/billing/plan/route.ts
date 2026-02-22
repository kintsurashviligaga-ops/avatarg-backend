import '@/lib/bootstrap';
import { resolveApiKeyAuth } from '@/lib/auth/apiKeyAuth';
import { getEntitlements } from '@/lib/billing/entitlements';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const auth = await resolveApiKeyAuth(req);
  if (!auth) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: jsonHeadersWithRequestId(requestId) }
    );
  }

  const entitlements = await getEntitlements(auth.userId);
  return Response.json(
    {
      ok: true,
      userId: auth.userId,
      teamId: auth.teamId,
      entitlements,
    },
    {
      status: 200,
      headers: jsonHeadersWithRequestId(requestId, { 'Cache-Control': 'no-store' }),
    }
  );
}