import { logStructured } from '@/lib/logging/logger';

type FailureInput = {
  requestId?: string;
  route: string;
  error: string;
};

const WINDOW_MS = 2 * 60_000;
const THRESHOLD = 5;
const DEBOUNCE_MS = 10 * 60_000;

let recentFailures: number[] = [];
let lastAlertAt = 0;

function trim(now: number): void {
  recentFailures = recentFailures.filter((value) => now - value <= WINDOW_MS);
}

async function sendTelegramAlert(text: string): Promise<void> {
  const token = String(process.env.ALERT_TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.ALERT_TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    logStructured('warn', 'alerts.telegram_send_failed', {
      status: response.status,
      event: 'alert_send_failed',
    });
  }
}

export async function recordFailureAndAlert(input: FailureInput): Promise<void> {
  const now = Date.now();
  recentFailures.push(now);
  trim(now);

  if (recentFailures.length < THRESHOLD) {
    return;
  }

  if (now - lastAlertAt < DEBOUNCE_MS) {
    return;
  }

  lastAlertAt = now;
  const text = [
    '🚨 AvatarG Backend errors threshold reached',
    `route: ${input.route}`,
    `requestId: ${input.requestId || 'n/a'}`,
    `error: ${input.error.slice(0, 180)}`,
  ].join('\n');

  await sendTelegramAlert(text);
  logStructured('warn', 'alerts.telegram_sent', {
    event: 'failure_alert_sent',
    route: input.route,
    requestId: input.requestId,
  });
}
