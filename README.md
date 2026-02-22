# avatarg-backend

Production-hardened Next.js serverless API for WhatsApp + Telegram webhooks.

## Minimal setup

1. Copy `.env.example` to `.env.local` and fill required vars.
2. Install deps: `npm install`
3. Run dev server: `npm run dev`
4. Run checks:
   - `npm run typecheck`
   - `npm run smoke:health`
   - `npm run smoke:health:prod` (against deployed backend)
   - `npm run smoke:webhook:whatsapp`
   - `npm run smoke:webhook:telegram`

## Required env vars

- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `TELEGRAM_BOT_TOKEN`

## Optional env vars

- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_SETUP_SECRET`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SENTRY_DSN`
- `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID`
- `FRONTEND_URL`, `PUBLIC_APP_URL`, `SITE_URL`

## Webhook URLs

- WhatsApp callback: `/api/webhooks/whatsapp`
- Telegram callback: `/api/webhooks/telegram`
- Telegram setup (optional): `/api/webhooks/telegram/setup?secret=<TELEGRAM_SETUP_SECRET>`

## Runtime endpoints

- `GET /api/health`
- `GET /api/metrics`

## Vercel env changes

After updating `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN`, redeploy in Vercel. Runtime env changes are not guaranteed to apply to already-running serverless instances until a new deployment is active.
