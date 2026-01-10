// worker/music-worker.js
import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

/**
 * REQUIRED ENV:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * MUSIC GENERATION (choose one option):
 * Option A (recommended): Your own API endpoint (server that calls Suno etc.)
 * - MUSIC_API_URL (e.g. https://your-domain.com/api/music/generate)
 * - MUSIC_API_KEY (optional, if your endpoint uses it)
 *
 * Option B: Direct Suno wrapper endpoint (if you have one)
 * - SUNO_API_URL
 * - SUNO_API_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase env vars.')
  console.error('SUPABASE_URL:', SUPABASE_URL)
  console.error('SUPABASE_SERVICE_ROLE_KEY exists:', !!SUPABASE_SERVICE_ROLE_KEY)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const POLL_MS = Number(process.env.MUSIC_WORKER_POLL_MS || 3000)
const REQUEST_TIMEOUT_MS = Number(process.env.MUSIC_REQUEST_TIMEOUT_MS || 120000)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeStringify(x) {
  try {
    return JSON.stringify(x)
  } catch {
    return String(x)
  }
}

/**
 * Calls your music generation endpoint.
 * Must return:
 *  - { url: "https://..." }  OR
 *  - { audio_url: "https://..." } OR
 *  - any JSON you want to store in result_json
 */
async function generateMusic({ prompt, duration_sec, job_id }) {
  const apiUrl = process.env.MUSIC_API_URL || process.env.SUNO_API_URL
  if (!apiUrl) {
    throw new Error(
      'MUSIC_API_URL (or SUNO_API_URL) is missing. Set it in .env'
    )
  }

  const headers = {
    'Content-Type': 'application/json',
  }

  // optional auth header
  const apiKey = process.env.MUSIC_API_KEY || process.env.SUNO_API_KEY
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const payload = {
    prompt,
    duration_sec,
    job_id,
  }

  const res = await axios.post(apiUrl, payload, {
    headers,
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true, // we handle status manually
  })

  if (res.status < 200 || res.status >= 300) {
    const msg =
      res.data?.error ||
      res.data?.message ||
      `Music API failed with status ${res.status}`
    const err = new Error(msg)
    err.response = { status: res.status, data: res.data }
    throw err
  }

  return res.data
}

async function markError(jobId, err) {
  const code = err?.response?.status ? String(err.response.status) : null
  const message =
    err?.response?.data
      ? safeStringify(err.response.data)
      : err?.message
        ? String(err.message)
        : safeStringify(err)

  const update = {
    status: 'error',
    error_code: code,
    error_message: message,
    error_at: new Date().toISOString(),
  }

  const { error: upErr } = await supabase
    .from('music_jobs')
    .update(update)
    .eq('id', jobId)

  if (upErr) {
    console.error('❌ Failed to write error into DB:', upErr)
  }
}

async function markDone(jobId, result) {
  // If you have columns like result_url/result_json, use them.
  // If not, keep only status.
  const resultUrl =
    result?.url || result?.audio_url || result?.audioUrl || null

  const update = {
    status: 'done',
    // Uncomment ONLY if these columns exist in your table:
    // result_url: resultUrl,
    // result_json: result,
    done_at: new Date().toISOString(),
  }

  // If you DO have result_url column, safely set it:
  if (resultUrl) update.result_url = resultUrl
  // If you DO have result_json column, safely set it:
  update.result_json = result

  const { error: upErr } = await supabase
    .from('music_jobs')
    .update(update)
    .eq('id', jobId)

  if (upErr) {
    console.error('❌ Failed to mark done in DB:', upErr)
  }
}

async function runWorker() {
  console.log('🎵 MUSIC WORKER STARTED')
  console.log('Poll ms:', POLL_MS)
  console.log('API URL:', process.env.MUSIC_API_URL || process.env.SUNO_API_URL)

  while (true) {
    try {
      // 1) claim job via RPC
      const { data: jobs, error: rpcError } = await supabase.rpc(
        'claim_next_music_job'
      )

      if (rpcError) {
        console.error('❌ RPC ERROR:', rpcError)
        await sleep(POLL_MS)
        continue
      }

      if (!jobs || jobs.length === 0) {
        // no jobs
        await sleep(POLL_MS)
        continue
      }

      const job = jobs[0]
      const jobId = job.id
      const prompt = job.prompt
      const durationSec = job.duration_sec ?? 30

      console.log(`✅ Claimed job: ${jobId}`)
      console.log('Prompt:', prompt)
      console.log('Duration:', durationSec)

      // 2) Generate music
      const result = await generateMusic({
        prompt,
        duration_sec: durationSec,
        job_id: jobId,
      })

      console.log(`✅ Generated music for job ${jobId}`)
      console.log('Result:', result)

      // 3) Mark done
      await markDone(jobId, result)
    } catch (err) {
      console.error('❌ MUSIC GENERATION ERROR')
      console.error('err:', err)
      console.error('err.message:', err?.message)
      console.error('err.response?.status:', err?.response?.status)
      console.error('err.response?.data:', err?.response?.data)

      // If we can detect job id from context, great — but we only have it if job was claimed.
      // So we try to read it from err.jobId if you ever attach it.
      const jobId = err?.jobId

      if (jobId) {
        await markError(jobId, err)
      } else {
        console.error(
          '⚠️ No jobId available in catch. If crash happens before job is set, DB cannot be updated.'
        )
      }

      await sleep(POLL_MS)
    }
  }
}

runWorker().catch((e) => {
  console.error('❌ FATAL WORKER ERROR:', e)
  process.exit(1)
})
