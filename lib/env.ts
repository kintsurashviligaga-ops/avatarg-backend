export type BackendEnvStatus = {
  WHATSAPP_VERIFY_TOKEN: boolean;
  WHATSAPP_ACCESS_TOKEN: boolean;
  WHATSAPP_PHONE_NUMBER_ID: boolean;
  WHATSAPP_BUSINESS_ACCOUNT_ID: boolean;
  WHATSAPP_APP_SECRET: boolean;
  SUPABASE_URL: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
  CRON_SECRET: boolean;
  FRONTEND_URL: boolean;
  SITE_URL: boolean;
  PUBLIC_APP_URL: boolean;
};

function hasValue(value: string | undefined): boolean {
  return Boolean(String(value || '').trim());
}

export function getBackendEnvStatus(): BackendEnvStatus {
  return {
    WHATSAPP_VERIFY_TOKEN: hasValue(process.env.WHATSAPP_VERIFY_TOKEN),
    WHATSAPP_ACCESS_TOKEN: hasValue(process.env.WHATSAPP_ACCESS_TOKEN),
    WHATSAPP_PHONE_NUMBER_ID: hasValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
    WHATSAPP_BUSINESS_ACCOUNT_ID: hasValue(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    WHATSAPP_APP_SECRET: hasValue(process.env.WHATSAPP_APP_SECRET),
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
