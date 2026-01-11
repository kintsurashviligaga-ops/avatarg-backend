import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

const MUSIC_BUCKET = process.env.MUSIC_BUCKET || 'music'

// ✅ IMPORTANT: PostgREST RPC expects function name WITHOUT schema
const RPC_CLAIM_FN = 'claim_next_music_job'
const RPC_STALE_FN = 'fail_stale_music_jobs'

const POLL_MS = Number(process.env.POLL_MS || 3000)
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000)
const STALE_PROCESSING_MINUTES = Number(process.env.STALE_PROCESSING_MINUTES || 15)
const JOB_HARD_TIMEOUT_MS = Number(process.env.JOB_HARD_TIMEOUT_MS || 180000)
const MAX_RETRY_DELAY_MS = Number(process.env.MAX_RETRY_DELAY_MS || 1800000)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
  console.error('❌ FATAL: Missing required env vars')
  process.exit(1)
}

const WORKER_ID = `worker-${crypto.randomBytes(4).toString('hex')}-${process.pid}`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

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

function calcRetryDelay(attempts) {
  const baseMs = 5000
  const delayMs = baseMs * Math.pow(3, attempts)
  return Math.min(delayMs, MAX_RETRY_DELAY_MS)
}

function calcNextRetryAt(attempts) {
  return new Date(Date.now() + calcRetryDelay(attempts)).toISOString()
}

async function updateJobSafe(id, patch) {
  const { error } = await supabase.from('music_jobs').update(patch).eq('id', id)
  if (error) log('error', 'DB UPDATE FAILED', { job_id: id, error: error.message })
}

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
      next_retry_at: new Date(Date.now() + 30000).toISOString()
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

async function claimNextJob() {
  const { data, error } = await supabase.rpc(RPC_CLAIM_FN, { p_worker_id: WORKER_ID })
  if (error) throw error
  if (!data) return null
  return Array.isArray(data) ? (data[0] || null) : data
}

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
    throw e
  }

  return Buffer.from(res.data)
}

async function uploadToStorage(jobId, audioBuffer) {
  const objectPath = `jobs/${jobId}.mp3`
  const { error } = await supabase.storage.from(MUSIC_BUCKET).upload(objectPath, audioBuffer, {
    contentType: 'audio/mpeg',
    upsert: true
  })
  if (error) throw error
  return objectPath
}

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
