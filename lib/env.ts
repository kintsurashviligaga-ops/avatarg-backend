export type BackendEnvStatus = {
  WHATSAPP_VERIFY_TOKEN: boolean;
  WHATSAPP_ACCESS_TOKEN: boolean;
  WHATSAPP_PHONE_NUMBER_ID: boolean;
  WHATSAPP_BUSINESS_ACCOUNT_ID: boolean;
  META_APP_SECRET: boolean;
  TELEGRAM_BOT_TOKEN: boolean;
  TELEGRAM_WEBHOOK_SECRET: boolean;
  TELEGRAM_SETUP_SECRET: boolean;
  UPSTASH_REDIS_REST_URL: boolean;
  UPSTASH_REDIS_REST_TOKEN: boolean;
  SENTRY_DSN: boolean;
  ALERT_TELEGRAM_BOT_TOKEN: boolean;
  ALERT_TELEGRAM_CHAT_ID: boolean;
  SUPABASE_URL: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
  CRON_SECRET: boolean;
  FRONTEND_URL: boolean;
  SITE_URL: boolean;
  PUBLIC_APP_URL: boolean;
};

export const REQUIRED_ENV_NAMES: Array<keyof BackendEnvStatus> = [
  'META_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRONTEND_URL',
];

export const OPTIONAL_ENV_NAMES: Array<keyof BackendEnvStatus> = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_SETUP_SECRET',
  'SENTRY_DSN',
  'ALERT_TELEGRAM_BOT_TOKEN',
  'ALERT_TELEGRAM_CHAT_ID',
  'CRON_SECRET',
  'SITE_URL',
  'PUBLIC_APP_URL',
];

export class EnvValidationError extends Error {
  missing: string[];

  constructor(missing: string[]) {
    super(`missing_required_env:${missing.join(',')}`);
    this.name = 'EnvValidationError';
    this.missing = missing;
  }
}

function hasValue(value: string | undefined): boolean {
  return Boolean(String(value || '').trim());
}

export function getBackendEnvStatus(): BackendEnvStatus {
  return {
    WHATSAPP_VERIFY_TOKEN: hasValue(process.env.WHATSAPP_VERIFY_TOKEN),
    WHATSAPP_ACCESS_TOKEN: hasValue(process.env.WHATSAPP_ACCESS_TOKEN),
    WHATSAPP_PHONE_NUMBER_ID: hasValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
    WHATSAPP_BUSINESS_ACCOUNT_ID: hasValue(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    META_APP_SECRET: hasValue(process.env.META_APP_SECRET),
    TELEGRAM_BOT_TOKEN: hasValue(process.env.TELEGRAM_BOT_TOKEN),
    TELEGRAM_WEBHOOK_SECRET: hasValue(process.env.TELEGRAM_WEBHOOK_SECRET),
    TELEGRAM_SETUP_SECRET: hasValue(process.env.TELEGRAM_SETUP_SECRET),
    UPSTASH_REDIS_REST_URL: hasValue(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: hasValue(process.env.UPSTASH_REDIS_REST_TOKEN),
    SENTRY_DSN: hasValue(process.env.SENTRY_DSN),
    ALERT_TELEGRAM_BOT_TOKEN: hasValue(process.env.ALERT_TELEGRAM_BOT_TOKEN),
    ALERT_TELEGRAM_CHAT_ID: hasValue(process.env.ALERT_TELEGRAM_CHAT_ID),
    SUPABASE_URL: hasValue(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
    CRON_SECRET: hasValue(process.env.CRON_SECRET),
    FRONTEND_URL: hasValue(process.env.FRONTEND_URL),
    SITE_URL: hasValue(process.env.SITE_URL),
    PUBLIC_APP_URL: hasValue(process.env.PUBLIC_APP_URL),
  };
}

export function assertRequiredEnv(name: keyof BackendEnvStatus): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`missing_required_env:${name}`);
  }
  return value;
}

export function getMissingEnvNames(names: Array<keyof BackendEnvStatus>): string[] {
  return names.filter((name) => !hasValue(process.env[name]));
}

export function requireRuntimeEnv(names: Array<keyof BackendEnvStatus>): Record<string, string> {
  const missing = getMissingEnvNames(names);
  if (missing.length > 0) {
    throw new EnvValidationError(missing.map((name) => String(name)));
  }

  const values: Record<string, string> = {};
  for (const name of names) {
    values[String(name)] = String(process.env[name] || '').trim();
  }

  return values;
}

export function getAllowedOrigin(): string | null {
  const preferred = String(process.env.FRONTEND_URL || '').trim();
  if (preferred) {
    return preferred;
  }

  const fallback = String(process.env.PUBLIC_APP_URL || '').trim();
  if (fallback) {
    return fallback;
  }

  return null;
}

export function getPublicBaseUrl(): string | null {
  const preferred = String(process.env.PUBLIC_APP_URL || '').trim();
  if (preferred) {
    return preferred.replace(/\/$/, '');
  }

  const fallback = String(process.env.SITE_URL || '').trim();
  if (fallback) {
    return fallback.replace(/\/$/, '');
  }

  return null;
}

export function shortVersion(): string {
  const fromVercel = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
  if (fromVercel) {
    return fromVercel.slice(0, 7);
  }

  return 'dev';
}

export function isTelegramEnabled(): boolean {
  const explicit = String(process.env.TELEGRAM_ENABLED || '').trim().toLowerCase();
  if (explicit === 'true') {
    return true;
  }

  return hasValue(process.env.TELEGRAM_BOT_TOKEN);
}

let bootValidationCompleted = false;

export function validateBootEnvOrThrow(): void {
  if (bootValidationCompleted) {
    return;
  }

  const required = [...REQUIRED_ENV_NAMES];
  if (isTelegramEnabled()) {
    required.push('TELEGRAM_BOT_TOKEN');
  }

  const missing = getMissingEnvNames(required);
  if (missing.length > 0) {
    console.error(`[BOOT_ENV_VALIDATION] missing required env: ${missing.join(', ')}`);
    throw new EnvValidationError(missing.map((name) => String(name)));
  }

  bootValidationCompleted = true;
}
