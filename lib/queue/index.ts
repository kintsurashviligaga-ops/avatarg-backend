import { randomUUID } from 'node:crypto';
import { type PlanTier } from '@/lib/config/plans';
import { logStructured } from '@/lib/logging/logger';
import { getMemoryStore } from '@/lib/memory/store';
import { routeMessage } from '@/lib/messaging/router';
import { redisPipeline, redisSetNxWithTtl } from '@/lib/redis';

export type QueueName = 'queue:low' | 'queue:standard' | 'queue:priority' | 'queue:vip';

export type QueueJob = {
  id: string;
  type: 'webhook_message' | 'ai_task' | 'heavy_task';
  source: 'whatsapp' | 'telegram' | 'ai' | 'system';
  createdAt: string;
  retries: number;
  maxRetries: number;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
};

const QUEUES: QueueName[] = ['queue:vip', 'queue:priority', 'queue:standard', 'queue:low'];

export function queueForTier(tier: PlanTier): QueueName {
  if (tier === 'AGENT_G_FULL') {
    return 'queue:vip';
  }
  if (tier === 'PREMIUM') {
    return 'queue:priority';
  }
  if (tier === 'BASIC') {
    return 'queue:standard';
  }
  return 'queue:low';
}

export async function enqueueJob(input: {
  queue: QueueName;
  type: QueueJob['type'];
  source: QueueJob['source'];
  payload: Record<string, unknown>;
  maxRetries?: number;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; queued: boolean; jobId: string }> {
  const id = randomUUID();
  const job: QueueJob = {
    id,
    type: input.type,
    source: input.source,
    createdAt: new Date().toISOString(),
    retries: 0,
    maxRetries: Math.max(0, input.maxRetries ?? 5),
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  };

  if (input.idempotencyKey) {
    const claim = await redisSetNxWithTtl(`idemp:job:${input.idempotencyKey}`, '1', 60 * 60 * 24, { strict: false });
    if (claim.enabled && claim.ok && !claim.value) {
      return { ok: true, queued: false, jobId: id };
    }
  }

  const payload = JSON.stringify(job);
  const result = await redisPipeline([['LPUSH', input.queue, payload]], { strict: false });
  if (!result) {
    return { ok: false, queued: false, jobId: id };
  }

  return { ok: true, queued: true, jobId: id };
}

async function popFromQueue(queue: QueueName): Promise<QueueJob | null> {
  const payload = await redisPipeline([['RPOP', queue]], { strict: false });
  const raw = payload?.[0]?.result;
  if (typeof raw !== 'string' || !raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as QueueJob;
  } catch {
    return null;
  }
}

async function pushWithBackoff(queue: QueueName, job: QueueJob): Promise<void> {
  const next: QueueJob = { ...job, retries: job.retries + 1 };
  if (next.retries > next.maxRetries) {
    await redisPipeline([['LPUSH', 'queue:dead_letter', JSON.stringify(next)]], { strict: false });
    return;
  }

  const backoffSec = Math.min(300, Math.max(2, 2 ** next.retries));
  await redisPipeline(
    [
      ['ZADD', 'queue:retry_scheduled', Date.now() + backoffSec * 1000, JSON.stringify(next)],
      ['EXPIRE', 'queue:retry_scheduled', 60 * 60 * 24 * 2, 'NX'],
      ['LPUSH', queue, JSON.stringify(next)],
    ],
    { strict: false }
  );
}

export async function processQueuedJob(job: QueueJob, requestId: string): Promise<void> {
  if (job.type === 'webhook_message') {
    const list = Array.isArray(job.payload.messages) ? (job.payload.messages as Array<Record<string, unknown>>) : [];
    const store = getMemoryStore();
    for (const item of list) {
      const platform: 'whatsapp' | 'telegram' = item.platform === 'telegram' ? 'telegram' : 'whatsapp';
      const normalized = {
        platform,
        messageId: String(item.messageId || ''),
        from: String(item.from || ''),
        chatId: String(item.chatId || ''),
        timestamp: Number(item.timestamp || Date.now()),
        text: typeof item.text === 'string' ? item.text : undefined,
        raw: item.raw,
      };
      await store.saveMessage(normalized);
      const decision = routeMessage(normalized);
      logStructured('info', 'queue.job_processed', {
        requestId,
        jobId: job.id,
        source: job.source,
        platform,
        messageId: normalized.messageId,
        action: decision.action,
      });
    }
    return;
  }

  logStructured('info', 'queue.job_skipped', {
    requestId,
    jobId: job.id,
    type: job.type,
  });
}

export async function drainQueues(input: { limit?: number; requestId: string }): Promise<{ processed: number; failed: number; queues: Record<string, number> }> {
  const limit = Math.max(1, Math.min(500, input.limit || 50));
  let processed = 0;
  let failed = 0;
  const queueCounts: Record<string, number> = {};

  while (processed + failed < limit) {
    let jobFound = false;
    for (const queue of QUEUES) {
      const job = await popFromQueue(queue);
      if (!job) {
        continue;
      }

      jobFound = true;
      queueCounts[queue] = (queueCounts[queue] || 0) + 1;
      try {
        await processQueuedJob(job, input.requestId);
        processed += 1;
      } catch {
        failed += 1;
        await pushWithBackoff(queue, job);
      }

      if (processed + failed >= limit) {
        break;
      }
    }

    if (!jobFound) {
      break;
    }
  }

  return {
    processed,
    failed,
    queues: queueCounts,
  };
}
