import '@/lib/bootstrap';
import { shortVersion } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      service: 'avatarg-backend',
      version: shortVersion(),
      build: {
        gitSha: String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim() || null,
        gitRef: String(process.env.VERCEL_GIT_COMMIT_REF || '').trim() || null,
        vercelEnv: String(process.env.VERCEL_ENV || '').trim() || null,
        vercelUrl: String(process.env.VERCEL_URL || '').trim() || null,
        nodeEnv: String(process.env.NODE_ENV || '').trim() || null,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}