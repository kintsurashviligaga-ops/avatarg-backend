import test from 'node:test';
import assert from 'node:assert/strict';
import { stripeWebhookIdempotencyKey } from '@/lib/billing/subscriptions';

test('stripe webhook idempotency key is deterministic', () => {
  const eventId = 'evt_123';
  assert.equal(stripeWebhookIdempotencyKey(eventId), 'idemp:stripe:webhook:evt_123');
});
