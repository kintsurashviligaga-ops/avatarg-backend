import { incrementMetric } from '@/lib/observability/redisMetrics';

type Platform = 'whatsapp' | 'telegram';

type CounterState = {
  webhook_requests_total: Record<Platform, number>;
  webhook_errors_total: Record<Platform, number>;
};

type LatencyPoint = {
  platform: Platform;
  latencyMs: number;
  timestamp: string;
};

const counters: CounterState = {
  webhook_requests_total: { whatsapp: 0, telegram: 0 },
  webhook_errors_total: { whatsapp: 0, telegram: 0 },
};

const latencies: LatencyPoint[] = [];
const LATENCY_HISTORY_LIMIT = 200;

export function recordWebhookRequest(platform: Platform): void {
  counters.webhook_requests_total[platform] += 1;
  void incrementMetric('requests_total', 1);
  void incrementMetric('webhook_events_total', 1);
}

export function recordWebhookError(platform: Platform): void {
  counters.webhook_errors_total[platform] += 1;
  void incrementMetric('errors_total', 1);
}

export function recordWebhookLatency(platform: Platform, latencyMs: number): void {
  latencies.push({
    platform,
    latencyMs,
    timestamp: new Date().toISOString(),
  });

  if (latencies.length > LATENCY_HISTORY_LIMIT) {
    latencies.splice(0, latencies.length - LATENCY_HISTORY_LIMIT);
  }
}

export function recordAiCallMetric(): void {
  void incrementMetric('requests_total', 1);
  void incrementMetric('ai_calls_total', 1);
}

export function recordApiErrorMetric(): void {
  void incrementMetric('errors_total', 1);
}

export function recordDedupeBlockMetric(): void {
  void incrementMetric('dedupe_blocks_total', 1);
}

export function getMetricsSnapshot(): { counters: CounterState; recentLatency: LatencyPoint[] } {
  return {
    counters: {
      webhook_requests_total: { ...counters.webhook_requests_total },
      webhook_errors_total: { ...counters.webhook_errors_total },
    },
    recentLatency: [...latencies],
  };
}
