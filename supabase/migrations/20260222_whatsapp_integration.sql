CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.whatsapp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phone_number_id TEXT,
  wa_id TEXT,
  message_id TEXT,
  event_type TEXT,
  raw JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  wa_id TEXT,
  message_id TEXT,
  text_in TEXT,
  intent TEXT,
  routing JSONB,
  result JSONB,
  error TEXT
);

CREATE TABLE IF NOT EXISTS public.whatsapp_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wa_id TEXT,
  payload JSONB NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  status_code INTEGER,
  response JSONB,
  error TEXT
);

CREATE INDEX IF NOT EXISTS whatsapp_events_wa_id_created_idx
  ON public.whatsapp_events (wa_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_events_message_id_uidx
  ON public.whatsapp_events (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_jobs_status_created_idx
  ON public.whatsapp_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS whatsapp_jobs_wa_id_created_idx
  ON public.whatsapp_jobs (wa_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_jobs_message_id_uidx
  ON public.whatsapp_jobs (message_id)
  WHERE message_id IS NOT NULL;