import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAiRequest } from '@/lib/ai/router';

test('free tier is restricted to mock provider', () => {
  const route = routeAiRequest(
    {
      taskType: 'chat',
      requestedModel: 'gpt-4.1',
      maxTokens: 5000,
      temperature: 1.5,
    },
    {
      requestId: 'test-rid',
      userId: 'u1',
      tier: 'FREE',
    }
  );

  assert.equal(route.provider, 'mock');
  assert.ok(route.maxTokens <= 400);
  assert.ok(route.temperature <= 0.8);
});
