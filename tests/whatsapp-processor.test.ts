import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/app/api/cron/whatsapp-processor/route';

test('processor returns 401 when CRON secret is missing', async () => {
  delete process.env.CRON_SECRET;
  const req = new Request('https://example.com/api/cron/whatsapp-processor');
  const res = await GET(req);
  assert.equal(res.status, 401);
});