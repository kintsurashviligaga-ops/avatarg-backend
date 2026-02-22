type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function shouldLog(level: LogLevel): boolean {
  if (level === 'debug') {
    return String(process.env.WHATSAPP_DEBUG || '').trim().toLowerCase() === 'true';
  }
  return true;
}

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const redactedKeys = new Set([
    'token',
    'access_token',
    'authorization',
    'secret',
    'signature',
    'password',
  ]);

  const source = value as Record<string, unknown>;
  const target: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(source)) {
    const normalized = key.toLowerCase();
    if (redactedKeys.has(normalized) || normalized.includes('token') || normalized.includes('secret')) {
      target[key] = '[redacted]';
      continue;
    }

    target[key] =
      typeof val === 'object' && val !== null && !Array.isArray(val)
        ? sanitize(val)
        : val;
  }

  return target;
}

export function logStructured(level: LogLevel, event: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...(meta ? { meta: sanitize(meta) } : {}),
  };

  if (level === 'error') {
    console.error('[Backend]', payload);
    return;
  }

  if (level === 'warn') {
    console.warn('[Backend]', payload);
    return;
  }

  console.info('[Backend]', payload);
}
