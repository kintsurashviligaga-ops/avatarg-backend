import test from 'node:test';
import assert from 'node:assert/strict';
import { getLimitForMetric } from '@/lib/billing/usage';

test('free tier has strict ai and message caps', () => {
  assert.equal(getLimitForMetric('FREE', 'messages'), 200);
  assert.equal(getLimitForMetric('FREE', 'ai_calls'), 20);
});

test('paid tiers scale limits upwards', () => {
  assert.ok(getLimitForMetric('BASIC', 'messages') > getLimitForMetric('FREE', 'messages'));
  assert.ok(getLimitForMetric('PREMIUM', 'messages') > getLimitForMetric('BASIC', 'messages'));
  assert.ok(getLimitForMetric('AGENT_G_FULL', 'messages') > getLimitForMetric('PREMIUM', 'messages'));
});
