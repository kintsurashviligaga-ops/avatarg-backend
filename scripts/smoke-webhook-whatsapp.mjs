import { createHmac } from 'node:crypto';

const baseUrl = (process.env.BACKEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const verifyToken = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const appSecret = String(process.env.META_APP_SECRET || '').trim();

if (!verifyToken) {
  throw new Error('WHATSAPP_VERIFY_TOKEN is required');
}
if (!appSecret) {
  throw new Error('META_APP_SECRET is required');
}

const verifyUrl = `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=12345`;
const verifyResponse = await fetch(verifyUrl, { cache: 'no-store' });
const verifyBody = await verifyResponse.text();

console.log(`[smoke:webhook:whatsapp] verify_status=${verifyResponse.status}`);
if (verifyResponse.status !== 200 || verifyBody !== '12345') {
  process.exit(1);
}

const payload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            contacts: [{ wa_id: '15550001111' }],
            messages: [
              {
                id: 'wamid.smoke.1',
                from: '15550001111',
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: 'help avatar' },
              },
            ],
          },
        },
      ],
    },
  ],
});

const signature = createHmac('sha256', appSecret).update(payload, 'utf8').digest('hex');
const postResponse = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-hub-signature-256': `sha256=${signature}`,
  },
  body: payload,
  cache: 'no-store',
});

console.log(`[smoke:webhook:whatsapp] post_status=${postResponse.status}`);
console.log(await postResponse.text());
if (postResponse.status !== 200) {
  process.exit(1);
}
