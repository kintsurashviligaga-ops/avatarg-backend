import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/* ===================== ENV ===================== */
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
  console.error('❌ FATAL: Missing required env vars')
  process.exit(1)
}

/* ===================== CONFIG ===================== */
const MUSIC_BUCKET = process.env.MUSIC_BUCKET || 'music'
const RPC_CLAIM_FN = process.env.RPC_CLAIM_FN || 'claim_next_music_job'
const POLL_MS = Number(process.env.POLL_MS || 3000)
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000)
const STALE_PROCESSING_MINUTES = Number(process.env.STALE_PROCESSING_MINUTES || 15)
const JOB_HARD_TIMEOUT_MS = Number(process.env.JOB_HARD_TIMEOUT_MS || 180000)
const MAX_RETRY_DELAY_MS = Number(process.env.MAX_RETRY_DELAY_MS || 1800000)
const MAX_ATTEMPTS_FALLBACK = Number(process.env.MAX_ATTEMPTS || 10)

// ElevenLabs endpoint for sound generation (per your current setup)
const ELEVEN_ENDPOINT = process.env.ELEVEN_ENDPOINT || 'https://api.elevenlabs.io/v1/sound-generation'

/* ===================== CLIENT ===================== */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

const WORKER_ID = `worker-${crypto.randomBytes(4).toString('hex')}-${process.pid}`

let shuttingDown = false
let activeJob = null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function nowIso() {
  return new Date().toISOString()
}

function log(level, message, meta = {}) {
  console.log(
    JSON.stringify({
      ts: nowIso(),
      level,
      worker_id: WORKER_ID,
      message,
      ...meta
    })
  )
}

function truncate(s, max = 1800) {
  if (s == null) return s
  const str = String(s)
  return str.length > max ? str.slice(0, max) + '...' : str
}

/* ===================== RETRY BACKOFF ===================== */
function calcRetryDelayMs(attempts) {
  // attempts: 1..N
  const baseMs = 5000
  const delay = baseMs * Math.pow(3, Math.max(0, attempts - 1))
  return Math.min(delay, MAX_RETRY_DELAY_MS)
}

function calcNextRetryAt(attempts) {
  const ms = calcRetryDelayMs(attempts)
  return new Date(Date.now() + ms).toISOString()
}

/* ===================== SAFE UPDATE (COLUMN-TOLERANT) ===================== */
function stripUnknownColumnError(errMsg) {
  // Postgres: column "xxx" of relation "music_jobs" does not exist
  const m = String(errMsg || '').match(/column "([^"]+)" of relation "([^"]+)"/i)
  return m?.[1] || null
}

async function updateJobSafe(id, patch) {
  // We try update; if DB says unknown column, we drop that column and retry once.
  const attemptUpdate = async (p) => supabase.from('music_jobs').update(p).eq('id', id)

  let { error } = await attemptUpdate(patch)
  if (!error) return

  const unknownCol = stripUnknownColumnError(error.message)
  if (unknownCol && Object.prototype.hasOwnProperty.call(patch, unknownCol)) {
    const { [unknownCol]: _removed, ...rest } = patch
    log('warn', 'DB column missing, retrying without field', { job_id: id, removed: unknownCol })
    ;({ error } = await attemptUpdate(rest))
    if (!error) return
  }

  log('error', 'DB UPDATE FAILED', { job_id: id, error: error.message })
}

/* ===================== GRACEFUL SHUTDOWN ===================== */
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
      error_at: nowIso(),
      next_retry_at: new Date(Date.now() + 60000).toISOString()
    })
  } finally {
    activeJob = null
  }
}

process.on('SIGINT', async () => {
  log('info', 'SIGINT — graceful shutdown')
  shuttingDown = true
  await cleanupActiveJob()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  log('info', 'SIGTERM — graceful shutdown')
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

/* ===================== CLAIM JOB (AUTO-DETECT SIGNATURE) ===================== */
let claimMode = null // 'withParam' | 'noParam'

async function claimNextJob() {
  const tryWithParam = async () => supabase.rpc(RPC_CLAIM_FN, { p_worker_id: WORKER_ID })
  const tryNoParam = async () => supabase.rpc(RPC_CLAIM_FN)

  // If we already detected which signature works, use it.
  if (claimMode === 'withParam') {
    const { data, error } = await tryWithParam()
    if (error) throw error
    return Array.isArray(data) ? data[0] || null : data || null
  }
  if (claimMode === 'noParam') {
    const { data, error } = await tryNoParam()
    if (error) throw error
    return Array.isArray(data) ? data[0] || null : data || null
  }

  // Detect automatically.
  {
    const { data, error } = await tryWithParam()
    if (!error) {
      claimMode = 'withParam'
      return Array.isArray(data) ? data[0] || null : data || null
    }

    // Typical error cases:
    // - function ... does not exist (param mismatch)
    // - could not choose best candidate function (duplicate overloads) -> still can work if we pick one style
    log('warn', 'claim(withParam) failed, trying noParam', { error: error.message })

    const res2 = await tryNoParam()
    if (res2.error) {
      // If both failed, throw the second error (more relevant)
      throw res2.error
    }

    claimMode = 'noParam'
    const d = res2.data
    return Array.isArray(d) ? d[0] || null : d || null
  }
}

/* ===================== ELEVENLABS ===================== */
async function elevenLabsGenerateAudio(prompt) {
  const res = await axios.post(
    ELEVEN_ENDPOINT,
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
    const e = new Error('Rate limit exceeded (429)')
    e.status = 429
    e.retryable = true
    throw e
  }

  if (res.status >= 400) {
    const e = new Error(`ElevenLabs error ${res.status}`)
    e.status = res.status
    e.retryable = res.status >= 500 || res.status === 408
    throw e
  }

  return Buffer.from(res.data)
}

/* ===================== STORAGE ===================== */
async function uploadToStorage(jobId, audioBuffer) {
  const objectPath = `jobs/${jobId}.mp3`

  const { error } = await supabase.storage.from(MUSIC_BUCKET).upload(objectPath, audioBuffer, {
    contentType: 'audio/mpeg',
    upsert: true
  })
  if (error) throw error

  // If bucket is public, this returns a usable URL. If private, it still returns but won't be accessible.
  const { data } = supabase.storage.from(MUSIC_BUCKET).getPublicUrl(objectPath)
  const publicUrl = data?.publicUrl || null

  return { objectPath, publicUrl }
}

/* ===================== PROCESS ===================== */
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
    prompt_preview: String(job.prompt || '').slice(0, 120)
  })

  try {
    const trimmed = String(job.prompt || '').trim()
    if (trimmed.length < 3) throw new Error('Prompt too short or empty')

    const audioBuffer = await elevenLabsGenerateAudio(trimmed)
    if (!audioBuffer || audioBuffer.length < 1000) {
      throw new Error(`Audio buffer too small: ${audioBuffer?.length} bytes`)
    }

    const { objectPath, publicUrl } = await uploadToStorage(job.id, audioBuffer)
    const duration = Date.now() - startTime

    // Done patch: keep compatible with your existing columns:
    // - audio_path (exists)
    // - audio_url / result_url (you have them; store publicUrl if any)
    // - completed_at (exists)
    // - processing_duration_ms (maybe not exists -> auto stripped)
    // - worker_id (maybe exists -> auto stripped)
    await updateJobSafe(job.id, {
      status: 'done',
      audio_path: objectPath,
      audio_bucket: MUSIC_BUCKET,
      audio_url: publicUrl,
      result_url: publicUrl,
      processing_duration_ms: duration,
      error_code: null,
      error_message: null,
      error_at: null,
      next_retry_at: null,
      completed_at: nowIso(),
      worker_id: null
    })

    log('info', 'Job completed', { job_id: job.id, duration_ms: duration, audio_path: objectPath })
  } catch (err) {
    const duration = Date.now() - startTime

    const isRetryable =
      !!err.retryable || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.status === 429

    const newAttempts = (job.attempts || 0) + 1
    const maxAttempts = Number(job.max_attempts || MAX_ATTEMPTS_FALLBACK)

    log('error', 'Job failed', {
      job_id: job.id,
      error: err.message,
      status: err.status,
      retryable: isRetryable,
      attempts: newAttempts,
      max_attempts: maxAttempts,
      duration_ms: duration
    })

    if (isRetryable && newAttempts <= maxAttempts) {
      const nextRetryAt = calcNextRetryAt(newAttempts)

      // IMPORTANT: on retry we keep status queued (NOT error)
      await updateJobSafe(job.id, {
        status: 'queued',
        attempts: newAttempts,
        next_retry_at: nextRetryAt,
        error_code: String(err.status || 'RETRY'),
        error_message: truncate(err.message),
        error_at: nowIso(),
        worker_id: null
      })

      log('info', 'Retry scheduled', { job_id: job.id, next_retry_at: nextRetryAt })
    } else {
      await updateJobSafe(job.id, {
        status: 'error',
        attempts: newAttempts,
        error_code: isRetryable ? 'MAX_ATTEMPTS' : String(err.status || 'FATAL'),
        error_message: truncate(err.message),
        error_at: nowIso(),
        worker_id: null
      })
    }
  }
}

/* ===================== STALE RECOVERY ===================== */
async function failStaleJobs() {
  try {
    const { data, error } = await supabase.rpc('fail_stale_music_jobs', {
      stale_minutes: STALE_PROCESSING_MINUTES
    })
    if (error) throw error
    if (Number(data || 0) > 0) {
      log('warn', 'Stale jobs recovered', { count: data })
    }
  } catch (err) {
    log('error', 'Stale job recovery error', { error: err.message })
  }
}

/* ===================== MAIN LOOP ===================== */
async function main() {
  log('info', 'MUSIC WORKER стартი', {
    rpc: RPC_CLAIM_FN,
    bucket: MUSIC_BUCKET,
    poll_ms: POLL_MS,
    request_timeout_ms: REQUEST_TIMEOUT_MS,
    job_hard_timeout_ms: JOB_HARD_TIMEOUT_MS,
    max_retry_delay_ms: MAX_RETRY_DELAY_MS,
    max_attempts_fallback: MAX_ATTEMPTS_FALLBACK,
    endpoint: ELEVEN_ENDPOINT
  })

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
      log('error', 'Worker loop error', { error: err.message })
      activeJob = null
      await sleep(POLL_MS)
    }
  }
}

main()
