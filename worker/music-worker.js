import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runWorker() {
  console.log('🎵 MUSIC WORKER STARTED')

  while (true) {
    const { data: jobs, error } = await supabase
      .rpc('claim_next_music_job')

    if (error) {
      console.error('❌ RPC ERROR', error)
      await sleep(3000)
      continue
    }

    if (!jobs || jobs.length === 0) {
      await sleep(3000)
      continue
    }

    const job = jobs[0]

    try {
      const response = await axios.post(
        'https://api.elevenlabs.io/v1/sound-generation',
        {
          text: job.prompt,
          duration_seconds: job.duration_sec,
          instrumental: job.instrumental
        },
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 10 * 60 * 1000
        }
      )

      await supabase
        .from('music_jobs')
        .update({
          status: 'completed',
          result_url: response.data?.url ?? null,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)

      console.log('✅ Job completed:', job.id)

    } catch (err) {
      console.error('❌ MUSIC GENERATION ERROR')
      console.error('err.message:', err?.message)
      console.error('err.response?.status:', err?.response?.status)
      console.error('err.response?.data:', err?.response?.data)

      await supabase
        .from('music_jobs')
        .update({
          status: 'error',
          error_code: err?.response?.status?.toString() ?? null,
          error_message: err?.response?.data
            ? JSON.stringify(err.response.data)
            : err?.message ?? String(err),
          error_at: new Date().toISOString()
        })
        .eq('id', job.id)
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

runWorker()
