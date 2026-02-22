import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/app/api/webhooks/whatsapp/route';

test('returns challenge when verify token matches', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'abc';
  const req = new Request('https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=777');
  const res = await GET(req);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.equal(body, '777');
});

test('returns forbidden when token mismatches', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'abc';
  const req = new Request('https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=777');
  const res = await GET(req);
  assert.equal(res.status, 403);
});