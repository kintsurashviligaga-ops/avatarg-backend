import { createHmac } from 'node:crypto';

const baseUrl = (process.env.BACKEND_BASE_URL || 'https://avatarg-backend.vercel.app').replace(/\/$/, '');
const verifyToken = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const appSecret = String(process.env.META_APP_SECRET || '').trim();
const apiKey = String(process.env.TEST_API_KEY || '').trim();

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function fetchJson(url, init) {
  const started = Date.now();
  const response = await fetch(url, { cache: 'no-store', ...init });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: response.status,
    latency_ms: Date.now() - started,
    body: json || text,
  };
}

async function run() {
  const report = {
    baseUrl,
    checks: [],
    warnings: [],
  };

  const health = await fetchJson(`${baseUrl}/api/health`);
  report.checks.push({
    name: 'health',
    status: health.status === 200 ? 'pass' : 'fail',
    details: health.body,
    latency_ms: health.latency_ms,
  });

  const verify = await fetchJson(`${baseUrl}/api/verify`);
  report.checks.push({
    name: 'verify_endpoint',
    status: verify.status === 200 ? 'pass' : 'fail',
    details: verify.body,
    latency_ms: verify.latency_ms,
  });

  if (verifyToken) {
    const waVerify = await fetchJson(
      `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=123456`
    );
    report.checks.push({
      name: 'whatsapp_verify',
      status: waVerify.status === 200 ? 'pass' : 'fail',
      details: waVerify.body,
      latency_ms: waVerify.latency_ms,
    });
  } else {
    report.warnings.push('WHATSAPP_VERIFY_TOKEN not set in runner env; skipped verify check.');
  }

  const telegramPayload = {
    update_id: Date.now(),
    message: {
      message_id: Date.now() % 100000,
      date: Math.floor(Date.now() / 1000),
      text: '/help avatar',
      chat: { id: 123456, type: 'private' },
      from: { id: 123456, is_bot: false, first_name: 'Matrix' },
    },
  };

  const tgFirst = await fetchJson(`${baseUrl}/api/webhooks/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(telegramPayload),
  });
  const tgSecond = await fetchJson(`${baseUrl}/api/webhooks/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(telegramPayload),
  });

  report.checks.push({
    name: 'telegram_duplicate',
    status: tgFirst.status === 200 && tgSecond.status === 200 ? 'pass' : 'fail',
    details: {
      first: tgFirst.body,
      second: tgSecond.body,
      duplicate_detected: Boolean(tgSecond.body?.duplicate),
    },
    latency_ms: tgFirst.latency_ms + tgSecond.latency_ms,
  });

  if (appSecret) {
    const waPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: '15550001111' }], messages: [{ id: `wamid.matrix.${Date.now()}`, from: '15550001111', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'matrix signed test' } }] } }] }],
    });
    const sig = createHmac('sha256', appSecret).update(waPayload, 'utf8').digest('hex');
    const waSigned = await fetchJson(`${baseUrl}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${sig}`,
      },
      body: waPayload,
    });
    report.checks.push({
      name: 'whatsapp_signed_post',
      status: waSigned.status === 200 ? 'pass' : 'fail',
      details: waSigned.body,
      latency_ms: waSigned.latency_ms,
    });
  } else {
    report.warnings.push('META_APP_SECRET not set in runner env; skipped signed WhatsApp check.');
  }

  if (apiKey) {
    const aiPayload = {
      taskType: 'chat',
      messages: [{ role: 'user', content: 'hello' }],
    };

    const aiResults = [];
    for (let i = 0; i < 4; i += 1) {
      aiResults.push(
        await fetchJson(`${baseUrl}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(aiPayload),
        })
      );
    }

    report.checks.push({
      name: 'rate_limit_and_plan_enforcement',
      status: aiResults.some((item) => item.status === 429 || item.status === 402) ? 'pass' : 'warn',
      details: aiResults.map((item) => ({ status: item.status, body: item.body })),
      latency_ms: aiResults.reduce((sum, item) => sum + item.latency_ms, 0),
    });
  } else {
    report.warnings.push('TEST_API_KEY not provided; skipped tier rate-limit/plan enforcement smoke check.');
  }

  report.overall_status = report.checks.some((check) => check.status === 'fail')
    ? 'fail'
    : report.checks.some((check) => check.status === 'warn')
      ? 'warn'
      : 'pass';

  output(report);
  if (report.overall_status === 'fail') {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  output({ overall_status: 'fail', error: error instanceof Error ? error.message : 'unknown_error' });
  process.exitCode = 1;
});
