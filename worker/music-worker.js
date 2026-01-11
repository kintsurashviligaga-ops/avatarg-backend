/**
 * Avatar G – Music Worker (FINAL FIXED)
 * FIX: Correct RPC call with required parameter p_worker_id
 */

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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
  console.error('❌ Missing required env vars')
  process.exit(1)
}

// =====================
// CONSTANTS
// =====================
const RPC_NAME = 'claim_next_music_job'
const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 5000)

// =====================
// WORKER ID (CRITICAL FIX)
// =====================
const WORKER_ID =
  process.env.WORKER_ID?.trim() ||
  `worker-${crypto.randomBytes(4).toString('hex')}`

// =====================
// SUPABASE CLIENT
// =====================
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

console.log('🎵 MUSIC WORKER STARTED')
console.log('Worker ID:', WORKER_ID)
console.log('RPC:', RPC_NAME)

// =====================
// HELPERS
// =====================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function claimNextJob() {
  const { data, error } = await supabase.rpc(RPC_NAME, {
    p_worker_id: WORKER_ID // ✅ THE FIX
  })

  if (error) throw error
  return data?.[0] || null
}

async function generateMusic(prompt) {
  const res = await axios.post(
    'https://api.elevenlabs.io/v1/sound-generation',
    { text: prompt },
    {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      responseType: 'arraybuffer'
    }
  )
  return Buffer.from(res.data)
}

async function upload(jobId, buffer) {
  const path = `jobs/${jobId}.mp3`
  const { error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .upload(path, buffer, { upsert: true, contentType: 'audio/mpeg' })

  if (error) throw error
  return path
}

// =====================
// MAIN LOOP
// =====================
async function loop() {
  while (true) {
    try {
      const job = await claimNextJob()

      if (!job) {
        await sleep(POLL_MS)
        continue
      }

      console.log('🎧 Processing job:', job.id)

      const audio = await generateMusic(job.prompt)
      const audioPath = await upload(job.id, audio)

      await supabase
        .from('music_jobs')
        .update({
          status: 'done',
          audio_path: audioPath,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)

      console.log('✅ Job completed:', job.id)
    } catch (err) {
      console.error('❌ Worker error:', err.message || err)
      await sleep(POLL_MS)
    }
  }
}

loop()
