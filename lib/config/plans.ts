export type PlanTier = 'FREE' | 'BASIC' | 'PREMIUM' | 'AGENT_G_FULL';

export type RouteGroup = 'public_api' | 'ai_api' | 'billing_api' | 'admin_api' | 'webhook_api';

export type PlanDefinition = {
  name: PlanTier;
  priceUsdMonthly: number;
  limits: {
    monthlyMessages: number;
    dailyAiCalls: number;
    monthlyTokens: number;
    monthlyJobMinutes: number;
    concurrencyJobs: number;
  };
  queuePriority: 'low' | 'standard' | 'priority' | 'vip';
  features: string[];
  rateLimitPerMinute: Record<RouteGroup, number>;
  aiPolicy: {
    allowedProviders: Array<'openai' | 'gemini' | 'mock'>;
    allowedModels: string[];
    maxTokensPerRequest: number;
    maxTemperature: number;
  };
};

export const PLAN_CONFIG: Record<PlanTier, PlanDefinition> = {
  FREE: {
    name: 'FREE',
    priceUsdMonthly: 0,
    limits: {
      monthlyMessages: 200,
      dailyAiCalls: 20,
      monthlyTokens: 100_000,
      monthlyJobMinutes: 60,
      concurrencyJobs: 1,
    },
    queuePriority: 'low',
    features: ['whatsapp_webhook', 'telegram_webhook', 'basic_ai'],
    rateLimitPerMinute: {
      public_api: 30,
      ai_api: 30,
      billing_api: 20,
      admin_api: 5,
      webhook_api: 120,
    },
    aiPolicy: {
      allowedProviders: ['mock'],
      allowedModels: ['mock-lite'],
      maxTokensPerRequest: 400,
      maxTemperature: 0.8,
    },
  },
  BASIC: {
    name: 'BASIC',
    priceUsdMonthly: 39,
    limits: {
      monthlyMessages: 3_000,
      dailyAiCalls: 200,
      monthlyTokens: 2_000_000,
      monthlyJobMinutes: 1_000,
      concurrencyJobs: 3,
    },
    queuePriority: 'standard',
    features: ['basic_ai', 'priority_support_email'],
    rateLimitPerMinute: {
      public_api: 120,
      ai_api: 120,
      billing_api: 60,
      admin_api: 10,
      webhook_api: 240,
    },
    aiPolicy: {
      allowedProviders: ['openai', 'gemini', 'mock'],
      allowedModels: ['gpt-4o-mini', 'gemini-1.5-flash', 'mock-lite'],
      maxTokensPerRequest: 1_500,
      maxTemperature: 1,
    },
  },
  PREMIUM: {
    name: 'PREMIUM',
    priceUsdMonthly: 150,
    limits: {
      monthlyMessages: 20_000,
      dailyAiCalls: 2_000,
      monthlyTokens: 15_000_000,
      monthlyJobMinutes: 8_000,
      concurrencyJobs: 10,
    },
    queuePriority: 'priority',
    features: ['advanced_ai', 'vision', 'priority_support'],
    rateLimitPerMinute: {
      public_api: 600,
      ai_api: 600,
      billing_api: 120,
      admin_api: 30,
      webhook_api: 600,
    },
    aiPolicy: {
      allowedProviders: ['openai', 'gemini', 'mock'],
      allowedModels: ['gpt-4.1-mini', 'gpt-4o-mini', 'gemini-1.5-pro', 'gemini-1.5-flash', 'mock-pro'],
      maxTokensPerRequest: 4_000,
      maxTemperature: 1.2,
    },
  },
  AGENT_G_FULL: {
    name: 'AGENT_G_FULL',
    priceUsdMonthly: 500,
    limits: {
      monthlyMessages: 100_000,
      dailyAiCalls: 10_000,
      monthlyTokens: 100_000_000,
      monthlyJobMinutes: 40_000,
      concurrencyJobs: 40,
    },
    queuePriority: 'vip',
    features: ['advanced_ai', 'full_automation', 'dedicated_priority'],
    rateLimitPerMinute: {
      public_api: 2_000,
      ai_api: 2_000,
      billing_api: 300,
      admin_api: 100,
      webhook_api: 2_000,
    },
    aiPolicy: {
      allowedProviders: ['openai', 'gemini', 'mock'],
      allowedModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gemini-1.5-pro', 'gemini-1.5-flash', 'mock-pro'],
      maxTokensPerRequest: 8_000,
      maxTemperature: 1.5,
    },
  },
};

export function parsePlanTier(value: string | null | undefined): PlanTier {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized in PLAN_CONFIG) {
    return normalized as PlanTier;
  }
  return 'FREE';
}

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_CONFIG[tier];
}