# avatarg-backend

Production-hardened Next.js serverless API for WhatsApp + Telegram webhooks with monetization, AI routing, observability, and queue-based scaling.

## Minimal setup

1. Copy `.env.example` to `.env.local` and fill required vars.
2. Install deps: `npm install`
3. Run dev server: `npm run dev`
4. Run checks:
   - `npm run typecheck`
   - `npm run test:platform`
   - `npm run smoke:health`
   - `npm run smoke:health:prod` (against deployed backend)
   - `npm run smoke:webhook:whatsapp`
   - `npm run smoke:webhook:telegram`
   - `npm run verify:matrix`

## Required env vars

- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`

## Optional env vars

- `TELEGRAM_BOT_TOKEN` (required if telegram is enabled)
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_SETUP_SECRET`
- `OPENAI_API_KEY`, `GEMINI_API_KEY`
- `SENTRY_DSN`
- `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PREMIUM`, `STRIPE_PRICE_AGENT_G_FULL`
- `BILLING_SUCCESS_URL`, `BILLING_CANCEL_URL`, `BILLING_PORTAL_RETURN_URL`
- `ADMIN_API_KEY`, `CRON_SECRET`
- `FRONTEND_URL`, `PUBLIC_APP_URL`, `SITE_URL`

## Webhook URLs

- WhatsApp callback: `/api/webhooks/whatsapp`
- Telegram callback: `/api/webhooks/telegram`
- Telegram setup (optional): `/api/webhooks/telegram/setup?secret=<TELEGRAM_SETUP_SECRET>`

## Runtime endpoints

- `GET /`
- `GET /api/version`
- `GET /api/health`
- `GET /api/metrics`
- `GET /api/verify`
- `POST /api/ai/chat`
- `GET /api/billing/plan`
- `POST /api/billing/create-checkout-session`
- `POST /api/billing/create-portal-session`
- `POST /api/billing/webhook`
- `GET /api/observability/health`
- `GET /api/observability/metrics` (admin-only, `x-admin-api-key`)
- `GET /api/observability/dashboard` (admin-only, `x-admin-api-key`)
- `POST /api/queue/drain` (admin/cron authorized)

## Plans / monetization

Plan policy is centralized in `lib/config/plans.ts`.

- `FREE`: $0
- `BASIC`: $39
- `PREMIUM`: $150
- `AGENT_G_FULL`: $500

Each plan defines quotas, rate limits, concurrency, queue tier, and allowed AI providers/models.

## Auth for billing and AI APIs

Current implementation uses replaceable API key auth:

- Header: `x-api-key`
- Redis mapping key: `auth:apikey:{sha256(api_key)}`
- Value format: `userId|teamId|tier`

## Queue mode

Queue abstraction lives in `lib/queue/index.ts` and uses Redis lists:

- `queue:low` (FREE)
- `queue:standard` (BASIC)
- `queue:priority` (PREMIUM)
- `queue:vip` (AGENT_G_FULL)

Webhooks now validate + enqueue quickly and return `200`.
Drain jobs via `POST /api/queue/drain` (admin/cron).

## Stripe setup

1. Create Stripe products/prices for `BASIC`, `PREMIUM`, `AGENT_G_FULL`.
2. Add price IDs to env: `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PREMIUM`, `STRIPE_PRICE_AGENT_G_FULL`.
3. Configure Stripe webhook endpoint: `/api/billing/webhook`.
4. Add signing secret to `STRIPE_WEBHOOK_SECRET`.

Webhook events are idempotent (Redis key `idemp:stripe:webhook:{event_id}`).

## Verification matrix

Run `npm run verify:matrix` with optional env:

- `BACKEND_BASE_URL`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `TEST_API_KEY`

It validates health, verify, signed WhatsApp (if secret available), Telegram duplicate behavior, idempotency, redis metrics, and optional plan/rate-limit smoke behavior.

## Vercel env changes

After updating `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN`, redeploy in Vercel. Runtime env changes are not guaranteed to apply to already-running serverless instances until a new deployment is active.
