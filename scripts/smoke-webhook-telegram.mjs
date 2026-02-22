const baseUrl = (process.env.BACKEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

const payload = {
  update_id: 999001,
  message: {
    message_id: 11,
    date: Math.floor(Date.now() / 1000),
    text: '/help avatar',
    chat: { id: 12345678, type: 'private' },
    from: { id: 12345678, is_bot: false, first_name: 'Smoke' },
  },
};

const headers = {
  'Content-Type': 'application/json',
};

if (secret) {
  headers['x-telegram-bot-api-secret-token'] = secret;
}

const response = await fetch(`${baseUrl}/api/webhooks/telegram`, {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
  cache: 'no-store',
});

console.log(`[smoke:webhook:telegram] status=${response.status}`);
console.log(await response.text());

if (response.status !== 200) {
  process.exit(1);
}
