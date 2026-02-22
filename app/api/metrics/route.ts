import { getMetricsSnapshot } from '@/lib/monitoring/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      timestamp: new Date().toISOString(),
      metrics: getMetricsSnapshot(),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
