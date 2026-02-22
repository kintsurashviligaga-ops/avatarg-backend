const baseUrl = (process.env.BACKEND_BASE_URL || 'https://avatarg-backend.vercel.app').replace(/\/$/, '');

const response = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
const body = await response.json().catch(() => null);

if (!response.ok || !body) {
  console.error('[smoke:health:prod] failed to fetch /api/health');
  process.exit(1);
}

const redisOk = Boolean(body?.checks?.redis?.ok);
const redisEnabled = Boolean(body?.checks?.redis?.enabled);

if (!redisEnabled || !redisOk) {
  console.error('[smoke:health:prod] redis check failed', {
    redisEnabled,
    redisOk,
    latencyMs: body?.checks?.redis?.latencyMs,
    missing: body?.checks?.redis?.missing,
  });
  process.exit(1);
}

console.log('[smoke:health:prod] ok', {
  version: body?.version,
  redisLatencyMs: body?.checks?.redis?.latencyMs,
});
