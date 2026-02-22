import { getBackendEnvStatus } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const env = getBackendEnvStatus();

  return Response.json(
    {
      ok: true,
      service: 'avatarg-backend',
      timestamp: new Date().toISOString(),
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
