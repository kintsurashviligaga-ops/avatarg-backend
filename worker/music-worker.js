import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// =====================
// ENV
// =====================
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

const MUSIC_BUCKET = process.env.MUSIC_BUCKET || 'music'

// ✅ PostgREST RPC expects function name WITHOUT schema
const RPC_CLAIM_FN = 'claim_next_music_job'
const RPC_STALE_FN = 'fail_stale_music_jobs'

const POLL_MS = Number(process.env.POLL_MS || 3000)
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000)
const STALE_PROCESSING_MINUTES = Number(process.env.STALE_PROCESSING_MINUTES || 15)
const JOB_HARD_TIMEOUT_MS = Number(process.env.JOB_HARD_TIMEOUT_MS || 180000)
const MAX_RETRY_DELAY_MS = Number(process.env.MAX_RETRY_DELAY_MS || 1800000)

// optional: prints env url for sanity checks
const DEBUG_URL = String(process.env.DEBUG_SUPABASE_URL || '0') === '1'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
  console.error('❌ FATAL: Missing required env vars')
  process.exit(1)
}

const WORKER_ID = `worker-${crypto.randomBytes(4).toString('hex')}-${process.pid}`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

// =====================
// STATE
// =====================
let shuttingDown = false
let activeJob = null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function log(level, message, meta = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      worker_id: WORKER_ID,
      message,
      ...meta
    })
  )
}

// =====================
// RETRY BACKOFF
// =====================
function calcRetryDelay(attempts) {
  // attempts: 1..N
  const baseMs = 5000
  const delayMs = baseMs * Math.pow(3, Math.max(0, attempts - 1))
  return Math.min(delayMs, MAX_RETRY_DELAY_MS)
}

function calcNextRetryAt(attempts) {
  return new Date(Date.now() + calcRetryDelay(attempts)).toISOString()
}

// =====================
// DB SAFE UPDATE
// =====================
async function updateJobSafe(id, patch) {
  const { error } = await supabase.from('music_jobs').update(patch).eq('id', id)
  if (error) log('error', 'DB UPDATE FAILED', { job_id: id, error: error.message })
}

// =====================
// GRACEFUL SHUTDOWN
// =====================
async function cleanupActiveJob() {
  if (!activeJob) return
  try {
    const newAttempts = (activeJob.attempts || 0) + 1
    log('warn', 'Releasing active job on shutdown', { job_id: activeJob.id, attempts: newAttempts })

    await updateJobSafe(activeJob.id, {
      status: 'queued',
      attempts: newAttempts,
      worker_id: null,
      error_code: 'WORKER_SHUTDOWN',
      error_message: 'Worker stopped during processing; re-queued.',
      error_at: new Date().toISOString(),
      next_retry_at: new Date(Date.now() + 30000).toISOString(),
      updated_at: new Date().toISOString()
    })
  } finally {
    activeJob = null
  }
}

process.on('SIGINT', async () => {
  log('info', 'SIGINT received — graceful shutdown')
  shuttingDown = true
  await cleanupActiveJob()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  log('info', 'SIGTERM received — graceful shutdown')
  shuttingDown = true
  await cleanupActiveJob()
  process.exit(0)
})

process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled Rejection', { reason: String(reason) })
})

process.on('uncaughtException', (err) => {
  log('error', 'Uncaught Exception', { error: err.message, stack: err.stack })
  process.exit(1)
})

// =====================
// RPC CLAIM + DIAGNOSE
// =====================
function extractSupabaseErrorCode(err) {
  // supabase-js error shape sometimes has "code"
  return err?.code || err?.details || err?.hint || null
}

function looksLikeSchemaCacheRpcMismatch(err) {
  const msg = String(err?.message || '')
  return (
    msg.includes('Could not find the function') &&
    msg.includes('without parameters') &&
    msg.includes('schema cache')
  )
}

async function diagnoseRpc() {
  // This will detect if PostgREST sees the function signature or not.
  // If there are no queued jobs, data=[] but status 200 is OK.
  const { data, error } = await supabase.rpc(RPC_CLAIM_FN, { p_worker_id: 'diag-worker' })
  if (error) {
    log('error', 'RPC DIAG FAILED', {
      rpc: RPC_CLAIM_FN,
      error: error.message,
      code: extractSupabaseErrorCode(error),
      hint:
        looksLikeSchemaCacheRpcMismatch(error)
          ? "Schema cache mismatch. Fix by dropping claim_next_music_job() overloads and ensuring claim_next_music_job(p_worker_id text) exists + NOTIFY pgrst, 'reload schema';"
          : undefined
    })
    throw error
  }
  log('info', 'RPC DIAG OK', {
    rpc: RPC_CLAIM_FN,
    returned_rows: Array.isArray(data) ? data.length : data ? 1 : 0
  })
}

async function claimNextJob() {
  const { data, error } = await supabase.rpc(RPC_CLAIM_FN, { p_worker_id: WORKER_ID })
  if (error) throw error
  // PostgREST returns SETOF as array (even if 0/1 row)
  return Array.isArray(data) ? data[0] || null : data || null
}

// =====================
// ELEVENLABS
// =====================
async function elevenLabsGenerateAudio(prompt) {
  const url = 'https://api.elevenlabs.io/v1/sound-generation'

  const res = await axios.post(
    url,
    { text: prompt },
    {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'arraybuffer',
      validateStatus: () => true
    }
  )

  if (res.status === 429) {
    const e = new Error('Rate limit exceeded')
    e.status = 429
    e.retryable = true
    throw e
  }

  if (res.status >= 400) {
    const e = new Error(`ElevenLabs error ${res.status}`)
    e.status = res.status
    e.retryable = res.status >= 500 || res.status === 408
    // attach response body for debug (small)
    try {
      e.responseBody = res.data ? Buffer.from(res.data).toString('utf8').slice(0, 500) : null
    } catch {}
    throw e
  }

  return Buffer.from(res.data)
}

// =====================
// STORAGE UPLOAD
// =====================
async function uploadToStorage(jobId, audioBuffer) {
  const objectPath = `jobs/${jobId}.mp3`

  const { error } = await supabase.storage.from(MUSIC_BUCKET).upload(objectPath, audioBuffer, {
    contentType: 'audio/mpeg',
    upsert: true
  })
  if (error) throw error

  return objectPath
}

// =====================
// PROCESSING
// =====================
async function processJobWithTimeout(job) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      const e = new Error('Job hard timeout exceeded')
      e.retryable = true
      reject(e)
    }, JOB_HARD_TIMEOUT_MS)
  })

  return Promise.race([processJob(job), timeoutPromise])
}

async function processJob(job) {
  const startTime = Date.now()

  log('info', 'Job claimed', {
    job_id: job.id,
    attempts: job.attempts || 0,
    max_attempts: job.max_attempts || 10,
    prompt_preview: String(job.prompt || '').slice(0, 120)
  })

  try {
    const trimmed = String(job.prompt || '').trim()
    if (trimmed.length < 3) throw new Error('Prompt too short or empty')

    const audioBuffer = await elevenLabsGenerateAudio(trimmed)
    if (!audioBuffer || audioBuffer.length < 1000) {
      throw new Error(`Audio buffer too small: ${audioBuffer?.length} bytes`)
    }

    const audioPath = await uploadToStorage(job.id, audioBuffer)
    const duration = Date.now() - startTime

    await updateJobSafe(job.id, {
      status: 'done',
      audio_bucket: MUSIC_BUCKET,
      audio_path: audioPath,
      processing_duration_ms: duration,
      error_code: null,
      error_message: null,
      error_at: null,
      next_retry_at: null,
      completed_at: new Date().toISOString(),
      worker_id: null,
      updated_at: new Date().toISOString()
    })

    log('info', 'Job completed', { job_id: job.id, duration_ms: duration })
  } catch (err) {
    const duration = Date.now() - startTime
    const isRetryable =
      err?.retryable === true ||
      err?.code === 'ECONNABORTED' ||
      err?.code === 'ETIMEDOUT' ||
      err?.status === 429 ||
      err?.status === 408 ||
      (typeof err?.status === 'number' && err.status >= 500)

    const newAttempts = (job.attempts || 0) + 1
    const maxAttempts = job.max_attempts || 10

    log('error', 'Job failed', {
      job_id: job.id,
      error: err?.message || String(err),
      status: err?.status,
      retryable: isRetryable,
      attempts: newAttempts,
      max_attempts: maxAttempts,
      duration_ms: duration,
      elevenlabs_body_preview: err?.responseBody
    })

    if (isRetryable && newAttempts <= maxAttempts) {
      const nextRetryAt = calcNextRetryAt(newAttempts)

      await updateJobSafe(job.id, {
        status: 'queued',
        attempts: newAttempts,
        next_retry_at: nextRetryAt,
        error_code: err?.status?.toString?.() || 'RETRY',
        error_message: String(err?.message || '').slice(0, 1800),
        error_at: new Date().toISOString(),
        worker_id: null,
        updated_at: new Date().toISOString()
      })

      log('info', 'Job retry scheduled', { job_id: job.id, next_retry_at: nextRetryAt })
    } else {
      await updateJobSafe(job.id, {
        status: 'error',
        attempts: newAttempts,
        error_code: isRetryable ? 'MAX_ATTEMPTS' : err?.status?.toString?.() || 'FATAL',
        error_message: String(err?.message || '').slice(0, 1800),
        error_at: new Date().toISOString(),
        worker_id: null,
        updated_at: new Date().toISOString()
      })
    }
  }
}

// =====================
// STALE RECOVERY
// =====================
async function failStaleJobs() {
  try {
    const { data, error } = await supabase.rpc(RPC_STALE_FN, {
      stale_minutes: STALE_PROCESSING_MINUTES
    })
    if (error) throw error
    if (Number(data || 0) > 0) log('warn', 'Stale jobs recovered', { count: data })
  } catch (err) {
    log('error', 'Stale job recovery error', { error: err?.message || String(err) })
  }
}

// =====================
// MAIN LOOP
// =====================
async function main() {
  log('info', 'Worker starting', {
    worker_id: WORKER_ID,
    rpc_claim: RPC_CLAIM_FN,
    rpc_stale: RPC_STALE_FN,
    poll_ms: POLL_MS,
    request_timeout_ms: REQUEST_TIMEOUT_MS,
    job_timeout_ms: JOB_HARD_TIMEOUT_MS,
    max_retry_delay_ms: MAX_RETRY_DELAY_MS
  })

  if (DEBUG_URL) {
    log('info', 'DEBUG: SUPABASE_URL', { SUPABASE_URL })
  }

  // ✅ Fail fast: diagnose RPC visibility immediately
  try {
    await diagnoseRpc()
  } catch (e) {
    // If schema cache mismatch, no point running loop: it will spam retries forever.
    if (looksLikeSchemaCacheRpcMismatch(e)) {
      log('error', 'FATAL RPC SCHEMA CACHE MISMATCH — fix SQL overloads + reload schema', {
        action:
          "Run SQL: drop claim_next_music_job(); drop claim_next_music_job(text); recreate claim_next_music_job(p_worker_id text) returns setof music_jobs; then NOTIFY pgrst, 'reload schema';"
      })
      process.exit(2)
    }
    log('error', 'FATAL RPC ERROR — cannot start worker', { error: e?.message || String(e) })
    process.exit(2)
  }

  let lastStaleCheck = Date.now()
  const STALE_CHECK_INTERVAL_MS = 60000

  while (!shuttingDown) {
    try {
      if (Date.now() - lastStaleCheck > STALE_CHECK_INTERVAL_MS) {
        await failStaleJobs()
        lastStaleCheck = Date.now()
      }

      const job = await claimNextJob()
      if (!job) {
        await sleep(POLL_MS)
        continue
      }

      activeJob = job
      await processJobWithTimeout(job)
      activeJob = null
    } catch (err) {
      // If RPC suddenly starts failing with schema cache mismatch, stop immediately (actionable)
      if (looksLikeSchemaCacheRpcMismatch(err)) {
        log('error', 'RPC schema cache mismatch detected during loop — stopping worker', {
          error: err.message,
          action:
            "Fix SQL overloads and run: NOTIFY pgrst, 'reload schema'; then restart worker."
        })
        process.exit(2)
      }

      log('error', 'Worker loop error', { error: err?.message || String(err) })
      activeJob = null
      await sleep(POLL_MS)
    }
  }
}

main()
