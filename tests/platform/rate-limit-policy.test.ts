import test from 'node:test';
import assert from 'node:assert/strict';
import { getTierRouteLimit } from '@/lib/security/tierRateLimit';

test('tier route limits are monotonic by plan', () => {
  const free = getTierRouteLimit('FREE', 'ai_api');
  const basic = getTierRouteLimit('BASIC', 'ai_api');
  const premium = getTierRouteLimit('PREMIUM', 'ai_api');
  const full = getTierRouteLimit('AGENT_G_FULL', 'ai_api');

  assert.ok(free < basic);
  assert.ok(basic < premium);
  assert.ok(premium < full);
});
