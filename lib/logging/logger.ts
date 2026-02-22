export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export type LogMeta = {
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  latencyMs?: number;
  event?: string;
  [key: string]: unknown;
};

const REDACT_KEYS = ['token', 'secret', 'authorization', 'signature', 'password', 'api_key', 'key'];

function shouldLog(level: LogLevel): boolean {
  if (level !== 'debug') {
    return true;
  }

  return String(process.env.DEBUG_LOGS || '').trim().toLowerCase() === 'true';
}

function maskTail(value: string): string {
  if (!value) {
    return value;
  }

  const suffix = value.slice(-4);
  return `***${suffix}`;
}

function sanitizeValue(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase();

  if (REDACT_KEYS.some((item) => normalized.includes(item))) {
    return '[redacted]';
  }

  if (normalized.includes('phone') || normalized.includes('chatid') || normalized === 'from' || normalized.includes('chat_id')) {
    if (typeof value === 'string') {
      return maskTail(value);
    }

    if (typeof value === 'number') {
      return maskTail(String(value));
    }
  }

  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'object' && entry ? sanitize(entry as Record<string, unknown>) : entry));
  }

  if (typeof value === 'object' && value !== null) {
    return sanitize(value as Record<string, unknown>);
  }

  return value;
}

function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = sanitizeValue(key, value);
  }
  return out;
}

export function logStructured(level: LogLevel, event: string, meta: LogMeta = {}): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    level,
    timestamp: new Date().toISOString(),
    event,
    ...sanitize(meta),
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}
