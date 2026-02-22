import { logWhatsAppSend } from '@/lib/whatsapp/db';

type SendResult = {
  ok: boolean;
  status: number | null;
  response?: Record<string, unknown> | null;
  error?: string;
};

function getRequiredEnv(name: 'WHATSAPP_ACCESS_TOKEN' | 'WHATSAPP_PHONE_NUMBER_ID'): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }
  return value;
}

export async function sendTextMessage(toWaId: string, text: string): Promise<SendResult> {
  const accessToken = getRequiredEnv('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = getRequiredEnv('WHATSAPP_PHONE_NUMBER_ID');
  const normalizedTo = String(toWaId || '').trim();
  const normalizedText = String(text || '').trim();

  if (!normalizedTo || !normalizedText) {
    return { ok: false, status: null, error: 'invalid_send_input' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'text',
    text: { body: normalizedText.slice(0, 4096) },
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const ok = response.ok;

    await logWhatsAppSend({
      waId: normalizedTo,
      payload,
      ok,
      statusCode: response.status,
      response: data,
      error: ok ? null : 'whatsapp_send_failed',
    });

    if (!ok) {
      return { ok: false, status: response.status, response: data, error: 'whatsapp_send_failed' };
    }

    return { ok: true, status: response.status, response: data };
  } catch (error) {
    await logWhatsAppSend({
      waId: normalizedTo,
      payload,
      ok: false,
      statusCode: null,
      response: null,
      error: error instanceof Error ? error.message : 'whatsapp_send_exception',
    });

    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : 'whatsapp_send_exception',
    };
  }
}