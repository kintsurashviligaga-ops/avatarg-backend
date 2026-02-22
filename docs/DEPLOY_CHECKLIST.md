# Deploy Checklist (Vercel)

## 1) Vercel Project Settings

- Root Directory: repository root (contains `package.json` with `next`, `react`, `react-dom`)
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output: Next.js default

## 2) Required Environment Variables

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SETUP_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## 3) Optional but Recommended

- `WHATSAPP_APP_SECRET` (enables Meta signature verification)
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `TELEGRAM_WEBHOOK_SECRET` (enables secret header validation)
- `FRONTEND_URL` (for API CORS allow-origin)
- `SITE_URL`
- `PUBLIC_APP_URL`
- `WHATSAPP_DEBUG=false`

## 4) Meta Webhook

- Callback URL: `https://avatarg-backend.vercel.app/api/webhooks/whatsapp`
- Verify token in Meta must exactly match `WHATSAPP_VERIFY_TOKEN`.

## 5) Telegram Webhook

- Callback URL: `https://avatarg-backend.vercel.app/api/webhooks/telegram`
- Setup endpoint: `https://avatarg-backend.vercel.app/api/webhooks/telegram/setup?secret=<TELEGRAM_SETUP_SECRET>`

## 6) Post-Deploy Smoke Tests

Health:

`curl -i "https://avatarg-backend.vercel.app/api/health"`

WhatsApp verify (good):

`curl -i "https://avatarg-backend.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=12345"`

WhatsApp verify (bad):

`curl -i "https://avatarg-backend.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"`

WhatsApp POST:

`curl -i -X POST "https://avatarg-backend.vercel.app/api/webhooks/whatsapp" -H "Content-Type: application/json" -d '{"object":"whatsapp_business_account","entry":[]}'`

Telegram setup (idempotent):

`curl -i "https://avatarg-backend.vercel.app/api/webhooks/telegram/setup?secret=<TELEGRAM_SETUP_SECRET>"`

Telegram POST:

`curl -i -X POST "https://avatarg-backend.vercel.app/api/webhooks/telegram" -H "Content-Type: application/json" -H "x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>" -d '{"update_id":1001,"message":{"message_id":1,"date":1700000000,"text":"hello","chat":{"id":123,"type":"private"},"from":{"id":123,"is_bot":false}}}'`

Expected outcomes:

- Health -> `200` with `{ "ok": true }`
- WhatsApp good verify -> `200` with plain challenge body
- WhatsApp bad verify -> `403`
- WhatsApp POST -> `200` quickly with `{ "ok": true }`
- Telegram setup -> `200` with `{ "ok": true }`
- Telegram POST -> `200` with `{ "ok": true }`
