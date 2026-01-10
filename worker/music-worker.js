import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

/* ===================== ENV ===================== */
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
  console.error('❌ Missing required ENV variables')
  process.exit(1)
}

/* ===================== CONFIG ===================== */
const MUSIC_BUCKET = 'music'
const POLL_MS = 3000
const HARD_TIMEOUT_MS = 180000

/* ===================== CLIENT ===================== */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()

/* ===================== CLAIM JOB ===================== */
async function claimJob() {
  const { data, error } = await supabase.rpc('claim_next_music_job')
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

/* ===================== ELEVENLABS TTS ===================== */
async function generateAudio(prompt) {
  const url =
    'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL'

  const res = await axios.post(
    url,
    {
      text: prompt,
      model_id: 'eleven_multilingual_v2'
    },
    {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      responseType: 'arraybuffer',
      timeout: 60000
    }
  )

  return Buffer.from(res.data)
}

/* ===================== STORAGE ===================== */
async function uploadAudio(jobId, buffer) {
  const path = `jobs/${jobId}.mp3`

  const { error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .upload(path, buffer, {
      contentType: 'audio/mpeg',
      upsert: true
    })

  if (error) throw error

  const { data } = supabase.storage.from(MUSIC_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/* ===================== PROCESS ===================== */
async function processJob(job) {
  try {
    console.log('🎵 Processing job:', job.id)

    const audio = await generateAudio(job.prompt)
    const url = await uploadAudio(job.id, audio)

    await supabase
      .from('music_jobs')
      .update({
        status: 'complete',
        audio_url: url,
        completed_at: now(),
        error_code: null,
        error_message: null
      })
      .eq('id', job.id)

    console.log('✅ Completed:', job.id)
  } catch (err) {
    console.error('❌ Failed job:', job.id, err.message)

    await supabase
      .from('music_jobs')
      .update({
        status: 'error',
        error_code: err.response?.status?.toString() || 'WORKER_ERROR',
        error_message: err.message,
        error_at: now()
      })
      .eq('id', job.id)
  }
}

/* ===================== LOOP ===================== */
async function main() {
  console.log('🚀 Music Worker started')

  while (true) {
    try {
      const job = await claimJob()
      if (!job) {
        await sleep(POLL_MS)
        continue
      }

      await Promise.race([
        processJob(job),
        new Promise((_, r) =>
          setTimeout(() => r(new Error('Timeout')), HARD_TIMEOUT_MS)
        )
      ])
    } catch (e) {
      console.error('⚠ Worker loop error:', e.message)
      await sleep(POLL_MS)
    }
  }
}

main()
