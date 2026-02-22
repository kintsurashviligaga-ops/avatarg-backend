import { getPlanDefinition, type PlanTier } from '@/lib/config/plans';
import { logStructured } from '@/lib/logging/logger';

export type AiTaskType = 'chat' | 'vision' | 'translation' | 'summarization';

export type AiRouteInput = {
  taskType: AiTaskType;
  requestedModel?: string;
  maxTokens?: number;
  temperature?: number;
};

export type AiRouteResult = {
  provider: 'openai' | 'gemini' | 'mock';
  model: string;
  maxTokens: number;
  temperature: number;
  fallbackChain: Array<{ provider: 'openai' | 'gemini' | 'mock'; model: string }>;
};

const TASK_PREFERRED_MODELS: Record<AiTaskType, string[]> = {
  chat: ['gpt-4o-mini', 'gemini-1.5-flash', 'mock-lite'],
  vision: ['gemini-1.5-pro', 'gpt-4o', 'mock-pro'],
  translation: ['gpt-4.1-mini', 'gemini-1.5-flash', 'mock-lite'],
  summarization: ['gpt-4.1-mini', 'gemini-1.5-flash', 'mock-lite'],
};

function inferProvider(model: string): 'openai' | 'gemini' | 'mock' {
  if (model.startsWith('gpt-')) {
    return 'openai';
  }
  if (model.startsWith('gemini-')) {
    return 'gemini';
  }
  return 'mock';
}

export function routeAiRequest(input: AiRouteInput, context: { userId: string; tier: PlanTier; requestId: string }): AiRouteResult {
  const plan = getPlanDefinition(context.tier);
  const preferred = TASK_PREFERRED_MODELS[input.taskType];
  const allowedModels = new Set(plan.aiPolicy.allowedModels);
  const allowedProviders = new Set(plan.aiPolicy.allowedProviders);

  const requestedModel = String(input.requestedModel || '').trim();
  const requestedProvider = requestedModel ? inferProvider(requestedModel) : null;

  const chain: Array<{ provider: 'openai' | 'gemini' | 'mock'; model: string }> = [];

  if (requestedModel && allowedModels.has(requestedModel) && requestedProvider && allowedProviders.has(requestedProvider)) {
    chain.push({ provider: requestedProvider, model: requestedModel });
  }

  for (const model of preferred) {
    const provider = inferProvider(model);
    if (!allowedModels.has(model) || !allowedProviders.has(provider)) {
      continue;
    }
    if (!chain.some((item) => item.model === model)) {
      chain.push({ provider, model });
    }
  }

  if (chain.length === 0) {
    chain.push({ provider: 'mock', model: 'mock-lite' });
  }

  const selected = chain[0];
  const maxTokens = Math.max(1, Math.min(plan.aiPolicy.maxTokensPerRequest, Number(input.maxTokens || plan.aiPolicy.maxTokensPerRequest)));
  const temperature = Math.max(0, Math.min(plan.aiPolicy.maxTemperature, Number(input.temperature ?? 0.7)));

  logStructured('info', 'ai.router_decision', {
    requestId: context.requestId,
    userId: context.userId,
    tier: context.tier,
    taskType: input.taskType,
    provider: selected.provider,
    model: selected.model,
    fallbackCount: Math.max(0, chain.length - 1),
    maxTokens,
    temperature,
  });

  return {
    provider: selected.provider,
    model: selected.model,
    maxTokens,
    temperature,
    fallbackChain: chain,
  };
}
