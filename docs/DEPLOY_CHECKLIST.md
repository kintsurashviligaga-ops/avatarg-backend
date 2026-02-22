# Deploy Checklist (Vercel)

## 1) Vercel Project Settings

- Root Directory: repository root (contains `package.json` with `next`, `react`, `react-dom`)
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output: Next.js default

## 2) Required Environment Variables

- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` (recommended in production)

## 3) Optional but Recommended

- `TELEGRAM_SETUP_SECRET` (for `/setup` endpoint)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (production rate limiting)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (message memory persistence)
- `SENTRY_DSN` (exception capture)
- `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` (failure alerts)
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `FRONTEND_URL` (for API CORS allow-origin)
- `SITE_URL`
- `PUBLIC_APP_URL`
- `DEBUG_LOGS=false`

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

`node scripts/smoke-webhook-whatsapp.mjs`

Telegram setup (idempotent):

`curl -i "https://avatarg-backend.vercel.app/api/webhooks/telegram/setup?secret=<TELEGRAM_SETUP_SECRET>"`

Telegram POST:

`node scripts/smoke-webhook-telegram.mjs`

Metrics endpoint:

`curl -i "https://avatarg-backend.vercel.app/api/metrics"`

Production Redis health assertion:

`BACKEND_BASE_URL=https://avatarg-backend.vercel.app npm run smoke:health:prod`

Expected outcomes:

- Health -> `200` with `{ "ok": true }`
- WhatsApp good verify -> `200` with plain challenge body
- WhatsApp bad verify -> `403`
- WhatsApp POST -> `200` quickly with `{ "ok": true }`
- Telegram setup -> `200` with `{ "ok": true }`
- Telegram POST -> `200` with `{ "ok": true }`

## 7) Vercel Env Reliability (Critical)

If Vercel says `variable already exists` / `No env variables were created`, it usually means the key already exists in that target environment.

Use this sequence:

1. Vercel Project -> Settings -> Environment Variables
2. Find existing key (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) and **Edit**, do not re-create
3. Save for all required targets (Production / Preview)
4. Trigger redeploy so runtime picks up changes:
	- Deployments -> latest -> `...` -> `Redeploy`
	- enable `Use existing Build Cache` (optional)
5. Verify with:
	- `curl https://avatarg-backend.vercel.app/api/health`
	- `npm run smoke:health:prod`

Expected in health payload:

- `checks.redis.enabled: true`
- `checks.redis.ok: true`
- `checks.redis.latencyMs` is present
