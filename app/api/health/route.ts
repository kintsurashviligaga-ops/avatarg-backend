import { getBackendEnvStatus } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const env = getBackendEnvStatus();
  const memory = process.memoryUsage();

  const runtime = {
    node: process.version,
    pid: process.pid,
    uptimeSec: Math.floor(process.uptime()),
    memory: {
      rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
    },
  };

  const messaging = {
    whatsappReady:
      env.WHATSAPP_VERIFY_TOKEN &&
      env.WHATSAPP_ACCESS_TOKEN &&
      env.WHATSAPP_PHONE_NUMBER_ID,
    telegramReady: env.TELEGRAM_BOT_TOKEN,
  };

  return Response.json(
    {
      ok: true,
      service: 'avatarg-backend',
      timestamp: new Date().toISOString(),
      runtime,
      messaging,
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
