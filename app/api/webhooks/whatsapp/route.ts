import { enqueueWhatsAppJob, persistWhatsAppEvents } from '@/lib/whatsapp/db';
import { extractIncomingWhatsAppEvents } from '@/lib/whatsapp/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response('Forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/plain' },
  });
}

async function handleWebhookPayload(payload: unknown): Promise<void> {
  const events = extractIncomingWhatsAppEvents(payload);
  if (!events.length) {
    return;
  }

  await persistWhatsAppEvents(events, payload);

  for (const event of events) {
    if (event.eventType !== 'message') {
      continue;
    }

    await enqueueWhatsAppJob({
      waId: event.waId,
      messageId: event.messageId,
      textIn: event.text,
    });
  }
}

export async function POST(req: Request): Promise<Response> {
  let payload: unknown = null;

  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  console.info('[WhatsApp.Webhook] inbound', {
    hasPayload: Boolean(payload),
  });

  void handleWebhookPayload(payload).catch((error) => {
    console.error('[WhatsApp.Webhook] async handling failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  });

  return Response.json({ ok: true }, { status: 200 });
}