import { createHash } from 'node:crypto';
import { logStructured } from '@/lib/logging/logger';
import { redisSetNxWithTtl } from '@/lib/redis';

type ClaimResult = {
  accepted: boolean;
  redisUsed: boolean;
  idempotencyKey: string;
};

type MemoryRecord = {
  expiresAt: number;
};

const memoryDedupe = new Map<string, MemoryRecord>();

function cleanup(now: number): void {
  for (const [key, value] of memoryDedupe.entries()) {
    if (value.expiresAt <= now) {
      memoryDedupe.delete(key);
    }
  }
}

function fallbackClaim(idempotencyKey: string, ttlSec: number): ClaimResult {
  const now = Date.now();
  cleanup(now);

  const existing = memoryDedupe.get(idempotencyKey);
  if (existing && existing.expiresAt > now) {
    return {
      accepted: false,
      redisUsed: false,
      idempotencyKey,
    };
  }

  memoryDedupe.set(idempotencyKey, { expiresAt: now + ttlSec * 1000 });
  return {
    accepted: true,
    redisUsed: false,
    idempotencyKey,
  };
}

export function buildEventId(input: {
  source: 'whatsapp' | 'telegram';
  rawBody: string;
  messageIds?: string[];
  fallbackId?: string;
}): string {
  if (input.messageIds && input.messageIds.length > 0) {
    return input.messageIds.join('|');
  }

  if (input.fallbackId) {
    return input.fallbackId;
  }

  const digest = createHash('sha256').update(input.rawBody, 'utf8').digest('hex').slice(0, 24);
  return `raw:${digest}`;
}

export async function claimWebhookEvent(input: {
  source: 'whatsapp' | 'telegram';
  eventId: string;
  ttlSec?: number;
  requestId: string;
}): Promise<ClaimResult> {
  const ttlSec = Math.max(60, input.ttlSec || 24 * 60 * 60);
  const idempotencyKey = `idemp:${input.source}:${input.eventId}`;

  try {
    const result = await redisSetNxWithTtl(idempotencyKey, '1', ttlSec, { strict: false });

    if (!result.enabled || !result.ok) {
      return fallbackClaim(idempotencyKey, ttlSec);
    }

    return {
      accepted: Boolean(result.value),
      redisUsed: true,
      idempotencyKey,
    };
  } catch {
    logStructured('warn', 'idempotency.fallback_memory', {
      requestId: input.requestId,
      source: input.source,
    });
    return fallbackClaim(idempotencyKey, ttlSec);
  }
}
