import { assertRequiredEnv, getPublicBaseUrl } from '@/lib/env';
import { logStructured } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authOk(req: Request): boolean {
  const expected = String(process.env.TELEGRAM_SETUP_SECRET || '').trim();
  if (!expected) {
    return false;
  }

  const url = new URL(req.url);
  const querySecret = String(url.searchParams.get('secret') || '').trim();
  const headerSecret = String(req.headers.get('x-telegram-setup-secret') || '').trim();
  const provided = headerSecret || querySecret;

  return Boolean(provided && provided === expected);
}

export async function GET(req: Request): Promise<Response> {
  if (!authOk(req)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = assertRequiredEnv('TELEGRAM_BOT_TOKEN');
  const webhookUrl = `${getPublicBaseUrl() || 'https://avatarg-backend.vercel.app'}/api/webhooks/telegram`;
  const webhookSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    method: 'GET',
    cache: 'no-store',
  });
  const infoPayload = (await infoRes.json().catch(() => null)) as { ok?: boolean; result?: { url?: string } } | null;

  if (infoRes.ok && infoPayload?.ok && infoPayload.result?.url === webhookUrl) {
    return Response.json({ ok: true, configured: true, alreadyConfigured: true, webhookUrl }, { status: 200 });
  }

  const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret || undefined,
    }),
    cache: 'no-store',
  });

  const setPayload = (await setRes.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!setRes.ok || !setPayload?.ok) {
    logStructured('error', 'telegram.setup_failed', {
      status: setRes.status,
      description: setPayload?.description || 'unknown',
    });
    return Response.json({ ok: false, error: 'Failed to set webhook' }, { status: 502 });
  }

  return Response.json({ ok: true, configured: true, webhookUrl }, { status: 200 });
}
