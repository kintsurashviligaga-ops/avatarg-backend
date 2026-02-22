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
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## 3) Optional but Recommended

- `WHATSAPP_APP_SECRET` (enables Meta signature verification)
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `FRONTEND_URL` (for API CORS allow-origin)
- `SITE_URL`
- `PUBLIC_APP_URL`
- `WHATSAPP_DEBUG=false`

## 4) Meta Webhook

- Callback URL: `https://avatarg-backend.vercel.app/api/webhooks/whatsapp`
- Verify token in Meta must exactly match `WHATSAPP_VERIFY_TOKEN`.

## 5) Post-Deploy Smoke Tests

- `GET /api/health` returns `200` and `{"ok":true,...}`
- Webhook verify with correct token returns `200` plain challenge
- Wrong token returns `403`
- Webhook `POST` returns `200` quickly with `{"ok":true}`
