import { createHash } from 'node:crypto';
import { parsePlanTier, type PlanTier } from '@/lib/config/plans';
import { redisGet, redisSetNxWithTtl } from '@/lib/redis';

export type AuthContext = {
  userId: string;
  teamId: string;
  tier: PlanTier;
  authMode: 'api_key';
};

function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function parseAuthRecord(raw: string | null): AuthContext | null {
  if (!raw) {
    return null;
  }

  const [userId, teamId, tier] = raw.split('|');
  if (!userId || !teamId) {
    return null;
  }

  return {
    userId,
    teamId,
    tier: parsePlanTier(tier),
    authMode: 'api_key',
  };
}

export async function resolveApiKeyAuth(req: Request): Promise<AuthContext | null> {
  const apiKey = String(req.headers.get('x-api-key') || '').trim();
  if (!apiKey) {
    return null;
  }

  const key = `auth:apikey:${hashApiKey(apiKey)}`;
  const result = await redisGet(key, { strict: false });
  if (!result.ok || !result.enabled) {
    return null;
  }

  return parseAuthRecord(result.value);
}

export async function bootstrapApiKeyMapping(input: {
  apiKey: string;
  userId: string;
  teamId: string;
  tier: PlanTier;
}): Promise<boolean> {
  const key = `auth:apikey:${hashApiKey(input.apiKey)}`;
  const value = `${input.userId}|${input.teamId}|${input.tier}`;
  const result = await redisSetNxWithTtl(key, value, 60 * 60 * 24 * 365 * 5, { strict: false });
  return Boolean(result.value);
}