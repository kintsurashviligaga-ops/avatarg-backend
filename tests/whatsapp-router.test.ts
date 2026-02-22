import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoutingPlan } from '@/lib/whatsapp/router';

test('routes video ad requests to multi-step chain', () => {
  const result = buildRoutingPlan({ waId: '9955', text: 'გააკეთე ვიდეო რეკლამა' });
  assert.equal(result.intent, 'video_ad');
  assert.ok(result.steps.length >= 3);
});

test('routes music requests to music service', () => {
  const result = buildRoutingPlan({ waId: '9955', text: 'make me a song' });
  assert.equal(result.intent, 'music_generation');
});