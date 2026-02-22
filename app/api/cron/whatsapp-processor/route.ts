import { buildRoutingPlan } from '@/lib/whatsapp/router';
import { fetchQueuedWhatsAppJobs, markWhatsAppJobStatus } from '@/lib/whatsapp/db';
import { sendTextMessage } from '@/lib/whatsapp/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) {
    return false;
  }

  const headerSecret = String(req.headers.get('x-cron-secret') || '').trim();
  const auth = String(req.headers.get('authorization') || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  return headerSecret === expected || bearer === expected;
}

async function processSingleJob(job: {
  id: string;
  wa_id: string | null;
  text_in: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  await markWhatsAppJobStatus(job.id, 'processing');

  const routingPlan = buildRoutingPlan({
    waId: job.wa_id || '',
    text: job.text_in || '',
    locale: 'ka',
    metadata: {},
  });

  const ackMessage = `მივიღე ✅ დავიწყე დამუშავება. Job ID: ${job.id}. Flow: ${routingPlan.steps
    .map((step) => step.service)
    .join(' -> ')}`;

  if (job.wa_id) {
    const sendResult = await sendTextMessage(job.wa_id, ackMessage);
    if (!sendResult.ok) {
      await markWhatsAppJobStatus(job.id, 'failed', {
        intent: routingPlan.intent,
        routing: routingPlan as unknown as Record<string, unknown>,
        error: sendResult.error || 'send_failed',
      });
      return { ok: false, error: sendResult.error || 'send_failed' };
    }
  }

  await markWhatsAppJobStatus(job.id, 'done', {
    intent: routingPlan.intent,
    routing: routingPlan as unknown as Record<string, unknown>,
    result: {
      ackSent: Boolean(job.wa_id),
      chain: routingPlan.steps,
    },
  });

  return { ok: true };
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(25, Math.max(1, Number(url.searchParams.get('limit') || 10)));

  const jobs = await fetchQueuedWhatsAppJobs(limit);

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const result = await processSingleJob(job);
    processed += 1;
    if (!result.ok) {
      failed += 1;
    }
  }

  return Response.json({
    ok: true,
    queuedFetched: jobs.length,
    processed,
    failed,
  });
}