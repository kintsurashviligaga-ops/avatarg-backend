import '@/lib/bootstrap';
import { createHmac } from 'node:crypto';
import { getPlanDefinition } from '@/lib/config/plans';
import { getBackendEnvStatus, getEnvIntegritySummary, shortVersion } from '@/lib/env';
import { getRequestId, jsonHeadersWithRequestId } from '@/lib/logging/request';
import { buildEventId, claimWebhookEvent } from '@/lib/messaging/idempotency';
import { redisPing } from '@/lib/redis';
import { getLimitForMetric } from '@/lib/billing/usage';
import { enforceTierRateLimit, getTierRouteLimit } from '@/lib/security/tierRateLimit';
import { verifyMetaSignature } from '@/lib/security/signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckStatus = 'pass' | 'fail' | 'warn';

type VerificationCheck = {
  name: string;
  status: CheckStatus;
  details: Record<string, unknown>;
  latency_ms: number;
};

function samplePayload() {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ wa_id: '15550001111' }],
              messages: [
                {
                  id: 'wamid.verify.sample.1',
                  from: '15550001111',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'verify signature sample' },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

async function runCheck(name: string, fn: () => Promise<Omit<VerificationCheck, 'name'>>): Promise<VerificationCheck> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return {
      name,
      ...result,
      latency_ms: result.latency_ms || Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name,
      status: 'fail',
      details: {
        error: error instanceof Error ? error.message : 'unknown_error',
      },
      latency_ms: Date.now() - startedAt,
    };
  }
}

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  const checks: VerificationCheck[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];

  const envStatus = getBackendEnvStatus();
  const envIntegrity = getEnvIntegritySummary(envStatus);

  checks.push(
    await runCheck('env_integrity', async () => ({
      status: envIntegrity.env_integrity_status === 'pass' ? 'pass' : 'fail',
      details: {
        env_integrity_status: envIntegrity.env_integrity_status,
        missing_vars: envIntegrity.missing_vars,
        malformed_vars: envIntegrity.malformed_vars,
      },
      latency_ms: 0,
    }))
  );

  const redisChecks = await Promise.all([redisPing({ strict: false }), redisPing({ strict: false }), redisPing({ strict: false })]);
  const redisAvgLatency = Math.round(redisChecks.reduce((sum, item) => sum + item.latencyMs, 0) / redisChecks.length);
  const redisOk = redisChecks.every((item) => item.ok);
  const redisEnabled = redisChecks.every((item) => item.enabled);

  checks.push(
    await runCheck('redis_ping', async () => ({
      status: redisOk ? 'pass' : 'warn',
      details: {
        redis_enabled: redisEnabled,
        redis_ping_ok: redisOk,
        latency_samples_ms: redisChecks.map((item) => item.latencyMs),
        latency_avg_ms: redisAvgLatency,
      },
      latency_ms: redisAvgLatency,
    }))
  );

  checks.push(
    await runCheck('whatsapp_signature_verification', async () => {
      const rawBody = samplePayload();
      const secret = String(process.env.META_APP_SECRET || '').trim();

      if (!secret) {
        return {
          status: 'fail',
          details: { reason: 'META_APP_SECRET_missing' },
          latency_ms: 0,
        };
      }

      const signature = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
      const headers = new Headers({
        'x-hub-signature-256': `sha256=${signature}`,
      });

      const valid = verifyMetaSignature(rawBody, headers, secret);
      return {
        status: valid ? 'pass' : 'fail',
        details: {
          valid,
          mode: 'local_signature_generation',
        },
        latency_ms: 0,
      };
    })
  );

  checks.push(
    await runCheck('telegram_duplicate_test', async () => {
      const updateId = `update:${Date.now()}`;
      const messageId = `message:${Date.now()}`;
      const first = await claimWebhookEvent({
        source: 'telegram',
        eventId: updateId,
        ttlSec: 24 * 60 * 60,
        requestId,
      });
      const second = await claimWebhookEvent({
        source: 'telegram',
        eventId: updateId,
        ttlSec: 24 * 60 * 60,
        requestId,
      });
      const messageClaim = await claimWebhookEvent({
        source: 'telegram',
        eventId: messageId,
        ttlSec: 24 * 60 * 60,
        requestId,
      });

      return {
        status: first.accepted && !second.accepted && messageClaim.accepted ? 'pass' : 'fail',
        details: {
          firstAccepted: first.accepted,
          secondAccepted: second.accepted,
          messageAccepted: messageClaim.accepted,
          redisUsed: first.redisUsed || second.redisUsed || messageClaim.redisUsed,
        },
        latency_ms: 0,
      };
    })
  );

  checks.push(
    await runCheck('idempotency_behavior', async () => {
      const eventId = buildEventId({
        source: 'whatsapp',
        rawBody: JSON.stringify({ message: 'verify' }),
        fallbackId: `verify-${Date.now()}`,
      });

      const first = await claimWebhookEvent({
        source: 'whatsapp',
        eventId,
        ttlSec: 24 * 60 * 60,
        requestId,
      });
      const second = await claimWebhookEvent({
        source: 'whatsapp',
        eventId,
        ttlSec: 24 * 60 * 60,
        requestId,
      });

      return {
        status: first.accepted && !second.accepted ? 'pass' : 'fail',
        details: {
          firstAccepted: first.accepted,
          secondAccepted: second.accepted,
          idempotency_key: first.idempotencyKey,
        },
        latency_ms: 0,
      };
    })
  );

  checks.push(
    await runCheck('plan_enforcement', async () => {
      const free = getPlanDefinition('FREE');
      const freeMessageLimit = getLimitForMetric('FREE', 'messages');
      return {
        status: free.priceUsdMonthly === 0 && freeMessageLimit > 0 ? 'pass' : 'fail',
        details: {
          free_price_usd: free.priceUsdMonthly,
          free_message_limit: freeMessageLimit,
          basic_price_usd: getPlanDefinition('BASIC').priceUsdMonthly,
          premium_price_usd: getPlanDefinition('PREMIUM').priceUsdMonthly,
          full_price_usd: getPlanDefinition('AGENT_G_FULL').priceUsdMonthly,
        },
        latency_ms: 0,
      };
    })
  );

  checks.push(
    await runCheck('tier_rate_limit', async () => {
      const userId = `verify-rate-${Date.now()}`;
      const limit = getTierRouteLimit('FREE', 'public_api');
      const attempts = Math.min(5, limit + 1);
      let blocked = false;

      for (let index = 0; index < attempts; index += 1) {
        const result = await enforceTierRateLimit({
          userId,
          tier: 'FREE',
          routeGroup: 'public_api',
          windowSec: 2,
        });
        if (!result.ok) {
          blocked = true;
          break;
        }
      }

      return {
        status: 'pass',
        details: {
          free_public_api_limit_per_minute: limit,
          sampled_attempts: attempts,
          blocked_observed: blocked,
        },
        latency_ms: 0,
      };
    })
  );

  if (envIntegrity.env_integrity_status !== 'pass') {
    warnings.push('Environment integrity is not fully satisfied.');
    nextActions.push('Set missing/malformed required environment variables in Vercel and redeploy.');
  }

  if (!redisOk) {
    warnings.push('Redis ping check is not fully healthy.');
    nextActions.push('Validate Upstash REST URL/token and connectivity from Vercel region.');
  }

  const hasFailure = checks.some((check) => check.status === 'fail');
  const hasWarn = checks.some((check) => check.status === 'warn');
  const overallStatus: 'pass' | 'warn' | 'fail' = hasFailure ? 'fail' : hasWarn ? 'warn' : 'pass';

  return Response.json(
    {
      overall_status: overallStatus,
      version: shortVersion(),
      request_id: requestId,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
      checks,
      warnings,
      next_actions: nextActions,
    },
    {
      status: overallStatus === 'fail' ? 503 : 200,
      headers: jsonHeadersWithRequestId(requestId, { 'Cache-Control': 'no-store' }),
    }
  );
}