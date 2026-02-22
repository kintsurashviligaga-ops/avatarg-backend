import { redisGet, redisPipeline } from '@/lib/redis';

export type MetricName =
  | 'requests_total'
  | 'errors_total'
  | 'ai_calls_total'
  | 'webhook_events_total'
  | 'dedupe_blocks_total';

function hourKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCHours()).padStart(2, '0')}`;
}

function dayKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function metricHourBucket(metric: MetricName, date = new Date()): string {
  return `metrics:${hourKey(date)}:${metric}`;
}

function metricDayBucket(metric: MetricName, date = new Date()): string {
  return `metrics_day:${dayKey(date)}:${metric}`;
}

function hourDates(windowHours: number): Date[] {
  const now = new Date();
  const out: Date[] = [];
  for (let offset = 0; offset < windowHours; offset += 1) {
    out.push(new Date(now.getTime() - offset * 60 * 60 * 1000));
  }
  return out;
}

export async function incrementMetric(metric: MetricName, amount = 1): Promise<void> {
  const safe = Math.max(0, Math.floor(amount));
  if (safe <= 0) {
    return;
  }

  const hour = metricHourBucket(metric);
  const day = metricDayBucket(metric);
  await redisPipeline(
    [
      ['INCRBY', hour, safe],
      ['EXPIRE', hour, 60 * 60 * 48, 'NX'],
      ['INCRBY', day, safe],
      ['EXPIRE', day, 60 * 60 * 24 * 40, 'NX'],
    ],
    { strict: false }
  );
}

export async function getMetricHourSeries(metric: MetricName, hours: number): Promise<Array<{ bucket: string; value: number }>> {
  const dates = hourDates(Math.max(1, hours));
  const values = await Promise.all(
    dates.map(async (date) => {
      const key = metricHourBucket(metric, date);
      const result = await redisGet(key, { strict: false });
      return {
        bucket: key,
        value: Number(result.value || 0),
      };
    })
  );

  return values.reverse();
}

export async function getDashboardMetrics(): Promise<{
  lastHour: Record<MetricName, number>;
  last24h: Record<MetricName, number>;
}> {
  const metricNames: MetricName[] = ['requests_total', 'errors_total', 'ai_calls_total', 'webhook_events_total', 'dedupe_blocks_total'];
  const lastHourEntries = await Promise.all(
    metricNames.map(async (name) => {
      const result = await redisGet(metricHourBucket(name), { strict: false });
      return [name, Number(result.value || 0)] as const;
    })
  );

  const last24Entries = await Promise.all(
    metricNames.map(async (name) => {
      const series = await getMetricHourSeries(name, 24);
      return [name, series.reduce((sum, item) => sum + item.value, 0)] as const;
    })
  );

  return {
    lastHour: Object.fromEntries(lastHourEntries) as Record<MetricName, number>,
    last24h: Object.fromEntries(last24Entries) as Record<MetricName, number>,
  };
}
