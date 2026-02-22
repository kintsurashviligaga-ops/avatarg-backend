# WhatsApp -> Avatar G Service Chain

## Routes
- `/api/webhooks/whatsapp` (GET verify, POST receive)
- `/api/cron/whatsapp-processor` (secured by `CRON_SECRET`)

## Required Env Vars (Vercel Production)
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## Meta Setup
- Callback URL: `https://avatarg-backend.vercel.app/api/webhooks/whatsapp`
- Verify token: same exact value as `WHATSAPP_VERIFY_TOKEN`

## Verification Checks
1. Valid token should echo challenge:
   - `GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123`
   - expected: `200` + plain text `123`
2. Wrong token:
   - expected: `403` + plain text `Forbidden`

## Processing Flow
1. Webhook POST stores incoming event in `whatsapp_events`
2. Message events enqueue jobs in `whatsapp_jobs` with `queued`
3. Cron endpoint picks queued jobs, builds routing chain, sends WhatsApp acknowledgment, marks `done` or `failed`

## Deploy Validation Checklist
- [ ] Run migration `20260222_whatsapp_integration.sql`
- [ ] Confirm webhook route responds correctly
- [ ] Trigger cron endpoint with `x-cron-secret`
- [ ] Confirm job lifecycle in Supabase
- [ ] Confirm outbound message appears in `whatsapp_send_logs`