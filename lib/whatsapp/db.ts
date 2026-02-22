import { getSupabaseAdmin } from '@/app/api/lib/supabaseAdmin';
import type { IncomingWhatsAppEvent } from '@/lib/whatsapp/normalize';

export type WhatsAppJob = {
  id: string;
  wa_id: string | null;
  message_id: string | null;
  text_in: string | null;
  status: string;
  routing: Record<string, unknown> | null;
};

export async function persistWhatsAppEvents(events: IncomingWhatsAppEvent[], rawPayload: unknown): Promise<void> {
  const supabase = getSupabaseAdmin();

  for (const event of events) {
    if (event.messageId) {
      const existing = await supabase
        .from('whatsapp_events')
        .select('id')
        .eq('message_id', event.messageId)
        .limit(1)
        .maybeSingle();

      if (existing.data?.id) {
        continue;
      }
    }

    await supabase.from('whatsapp_events').insert({
      phone_number_id: event.phoneNumberId,
      wa_id: event.waId,
      message_id: event.messageId,
      event_type: event.eventType,
      raw: rawPayload,
    });
  }
}

export async function enqueueWhatsAppJob(params: {
  waId: string | null;
  messageId: string | null;
  textIn: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  if (params.messageId) {
    const existing = await supabase
      .from('whatsapp_jobs')
      .select('id')
      .eq('message_id', params.messageId)
      .limit(1)
      .maybeSingle();

    if (existing.data?.id) {
      return;
    }
  }

  await supabase.from('whatsapp_jobs').insert({
    status: 'queued',
    wa_id: params.waId,
    message_id: params.messageId,
    text_in: params.textIn,
  });
}

export async function fetchQueuedWhatsAppJobs(limit: number): Promise<WhatsAppJob[]> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from('whatsapp_jobs')
    .select('id, wa_id, message_id, text_in, status, routing')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit);

  return (result.data || []) as WhatsAppJob[];
}

export async function markWhatsAppJobStatus(
  id: string,
  status: 'processing' | 'done' | 'failed',
  patch?: {
    intent?: string | null;
    routing?: Record<string, unknown> | null;
    result?: Record<string, unknown> | null;
    error?: string | null;
  }
): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase
    .from('whatsapp_jobs')
    .update({
      status,
      intent: patch?.intent ?? null,
      routing: patch?.routing ?? null,
      result: patch?.result ?? null,
      error: patch?.error ?? null,
    })
    .eq('id', id);
}

export async function logWhatsAppSend(params: {
  waId: string;
  payload: Record<string, unknown>;
  ok: boolean;
  statusCode: number | null;
  response: Record<string, unknown> | null;
  error?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase.from('whatsapp_send_logs').insert({
    wa_id: params.waId,
    payload: params.payload,
    ok: params.ok,
    status_code: params.statusCode,
    response: params.response,
    error: params.error ?? null,
  });
}