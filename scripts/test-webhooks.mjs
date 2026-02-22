const baseUrl = (process.env.BACKEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const verifyToken = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const telegramSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, { cache: 'no-store', ...(init || {}) });
  const body = await response.text();
  return { response, body };
}

async function run() {
  console.log(`[webhooks] base URL: ${baseUrl}`);

  const health = await fetchJson(`${baseUrl}/api/health`);
  assert(health.response.status === 200, `health expected 200, got ${health.response.status}`);
  assert(health.body.includes('"ok":true'), 'health expected ok:true');

  assert(verifyToken, 'WHATSAPP_VERIFY_TOKEN must be set');
  const verifyOk = await fetchJson(
    `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=12345`
  );
  assert(verifyOk.response.status === 200, `whatsapp verify expected 200, got ${verifyOk.response.status}`);
  assert(verifyOk.body === '12345', `whatsapp verify expected challenge, got ${verifyOk.body}`);

  const verifyBad = await fetchJson(
    `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=12345`
  );
  assert(verifyBad.response.status === 403, `whatsapp wrong verify expected 403, got ${verifyBad.response.status}`);

  const waPost = await fetchJson(`${baseUrl}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object: 'whatsapp_business_account', entry: [] }),
  });
  assert(waPost.response.status === 200, `whatsapp post expected 200, got ${waPost.response.status}`);

  const waMalformed = await fetchJson(`${baseUrl}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad-json',
  });
  assert(waMalformed.response.status === 200, `whatsapp malformed expected 200, got ${waMalformed.response.status}`);

  const telegramHeaders = { 'Content-Type': 'application/json' };
  if (telegramSecret) {
    telegramHeaders['x-telegram-bot-api-secret-token'] = telegramSecret;
  }

  const tgPost = await fetchJson(`${baseUrl}/api/webhooks/telegram`, {
    method: 'POST',
    headers: telegramHeaders,
    body: JSON.stringify({
      update_id: 1001,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        text: 'hello',
        chat: { id: 111, type: 'private' },
        from: { id: 111, is_bot: false },
      },
    }),
  });
  assert(tgPost.response.status === 200, `telegram post expected 200, got ${tgPost.response.status}`);

  console.log('[webhooks] all checks passed');
}

run().catch((error) => {
  console.error('[webhooks] FAILED', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
