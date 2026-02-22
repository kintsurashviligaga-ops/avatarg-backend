import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetSendFetchForTests,
  __resetSendLoggerForTests,
  __setSendFetchForTests,
  __setSendLoggerForTests,
  sendTextMessage,
} from '@/lib/whatsapp/client';

test('sendTextMessage is mockable and returns success', async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123';

  __setSendLoggerForTests(async () => undefined);
  __setSendFetchForTests(async () =>
    new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );

  const result = await sendTextMessage('9955000111', 'hello');
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);

  __resetSendFetchForTests();
  __resetSendLoggerForTests();
});