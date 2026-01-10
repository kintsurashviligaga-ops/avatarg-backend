import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

const MUSIC_BUCKET = process.env.MUSIC_BUCKET || 'music'
const RPC_CLAIM_FN = process.env.RPC_CLAIM_FN || 'claim_next_music_job'
const POLL_MS = Number(process.env.POLL_MS || 3000)
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000)
const RETRIES = Number(process.env.RETRIES || 2)
const STALE_PROCESSING_MINUTES = Number(process.env.STALE_PROCESSING_MINUTES || 15)
const JOB_HARD_TIMEOUT_MS = Number(process.env.JOB_HARD_TIMEOUT_MS || 180000)

const WRITE_OUTPUT_COLUMNS = (process.env.WRITE_OUTPUT_COLUMNS || 'false').toLowerCase() === 'true'
const OUTPUT_PATH_COLUMN = process.env.OUTPUT_PATH_COLUMN || 'audio_path'
const OUTPUT_URL_COLUMN = process.env.OUTPUT_URL_COLUMN || 'audio_url'

if (!SUPABASE_URL) {
  console.error('❌ FATAL: Missing SUPABASE_URL')
  process.exit(1)
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ FATAL: Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!ELEVENLABS_API_KEY) {
  console.error('❌ FATAL: Missing ELEVENLABS_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

let shuttingDown = false
process.on('SIGINT', () => {
  console.log('👋 SIGINT received — graceful shutdown')
  shuttingDown = true
})
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received — graceful shutdown')
  shuttingDown = true
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function nowIso() {
  return new Date().toISOString()
}

function truncate(str, max = 2000) {
  if (!str) return str
  const s = String(str)
  return s.length > max ? s.slice(0, max) + '...' : s
}

function safeStatus(err) {
  return err?.response?.status?.toString?.() || null
}

function safeErrMessage(err) {
  try {
    if (err?.response?.data) {
      const raw = JSON.stringify(err.response.data)
      return truncate(raw, 1800)
    }
  } catch (_) {}
  return truncate(err?.message || String(err), 1800)
}

async function updateJobSafe(id, patch) {
  const { error } = await supabase.from('music_jobs').update(patch).eq('id', id)
  if (!error) return

  const minimal = {}
  if ('status' in patch) minimal.status = patch.status
  if ('error_code' in patch) minimal.error_code = patch.error_code
  if ('error_message' in patch) minimal.error_message = patch.error_message
  if ('error_at' in patch) minimal.error_at = patch.error_at
  if ('started_at' in patch) minimal.started_at = patch.started_at
  if ('completed_at' in patch) minimal.completed_at = patch.completed_at

  const { error: error2 } = await supabase.from('music_jobs').update(minimal).eq('id', id)
  if (error2) {
    console.error('❌ DB UPDATE FAILED (fallback):', error2.message)
  } else {
    console.log('🟠 DB UPDATE fallback used')
  }
}

async function claimNextJob() {
  const { data, error } = await supabase.rpc(RPC_CLAIM_FN)
  if (error) throw error
  if (!data) return null
  if (Array.isArray(data)) return data[0] || null
  return data
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

  if (res.status >= 400) {
    const msg = `ElevenLabs error ${res.status}: ${Buffer.from(res.data || '').toString('utf8')}`
    const e = new Error(msg)
    e.status = res.status
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

  const { data } = supabase.storage.from(MUSIC_BUCKET).getPublicUrl(objectPath)
  const publicUrl = data?.publicUrl || null

  return { objectPath, publicUrl }
}

async function withRetries(fn, retries = RETRIES) {
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastErr = err
      const isLast = attempt === retries
      console.error(`❌ Attempt ${attempt + 1}/${retries + 1} failed:`, safeErrMessage(err))
      if (isLast) break
      await sleep(800 * (attempt + 1))
    }
  }
  throw lastErr
}

async function processJobWithTimeout(job) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Job hard timeout exceeded')), JOB_HARD_TIMEOUT_MS)
  })

  return Promise.race([processJob(job), timeoutPromise])
}

async function processJob(job) {
  console.log('============================================================')
  console.log('🟡 JOB CLAIMED:', job.id)
  console.log('🟡 PROMPT:', job.prompt)
  console.log('🟡 STARTED_AT:', job.started_at)
  console.log('============================================================')

  try {
    const trimmed = String(job.prompt || '').trim()
    if (trimmed.length < 3) {
      throw new Error('Prompt too short or empty')
    }

    console.log('🟡 Calling ElevenLabs Sound Generation...')
    const audioBuffer = await withRetries(async () => {
      const buf = await elevenLabsGenerateAudio(trimmed)
      if (!buf || buf.length < 1000) {
        throw new Error(`Audio buffer too small: ${buf?.length} bytes`)
      }
      return buf
    })

    console.log('🟢 Audio generated:', audioBuffer.length, 'bytes')

    console.log('🟡 Uploading to Supabase Storage...')
    const { objectPath, publicUrl } = await uploadToStorage(job.id, audioBuffer)
    console.log('🟢 Upload success:', objectPath)
    console.log('🟢 Public URL:', publicUrl)

    const patch = {
      status: 'complete',
      error_code: null,
      error_message: null,
      error_at: null,
      completed_at: nowIso()
    }

    if (WRITE_OUTPUT_COLUMNS) {
      patch[OUTPUT_PATH_COLUMN] = objectPath
      patch[OUTPUT_URL_COLUMN] = publicUrl
    }

    await updateJobSafe(job.id, patch)
    console.log('✅ JOB COMPLETED:', job.id)
  } catch (err) {
    console.error('❌ JOB FAILED:', job.id)
    console.error('Error:', safeErrMessage(err))

    await updateJobSafe(job.id, {
      status: 'error',
      error_code: safeStatus(err) || 'UNKNOWN',
      error_message: safeErrMessage(err),
      error_at: nowIso()
    })
  }
}

async function failStaleJobs() {
  try {
    const { data, error } = await supabase.rpc('fail_stale_music_jobs', {
      stale_minutes: STALE_PROCESSING_MINUTES
    })
    if (error) throw error
    if (data > 0) {
      console.log(`🟠 Recovered ${data} stale job(s)`)
    }
  } catch (err) {
    console.error('❌ Stale job recovery error:', safeErrMessage(err))
  }
}

async function main() {
  console.log('✅ ENV validated')
  console.log('🎵 MUSIC WORKER — PRODUCTION')
  console.log('Table: music_jobs')
  console.log('Bucket:', MUSIC_BUCKET)
  console.log('RPC:', RPC_CLAIM_FN)
  console.log('Poll interval:', POLL_MS, 'ms')
  console.log('Request timeout:', REQUEST_TIMEOUT_MS, 'ms')
  console.log('Job hard timeout:', JOB_HARD_TIMEOUT_MS, 'ms')
  console.log('Retries:', RETRIES)
  console.log('Stale processing threshold:', STALE_PROCESSING_MINUTES, 'min')
  console.log('Write output columns:', WRITE_OUTPUT_COLUMNS)
  console.log('------------------------------------------------------------')

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

      await processJobWithTimeout(job)
    } catch (err) {
      console.error('❌ Worker loop error:', safeErrMessage(err))
      await sleep(POLL_MS)
    }
  }

  console.log('👋 Worker stopped gracefully')
  process.exit(0)
}

main()
