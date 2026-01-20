import { supabaseAdmin } from '../supabaseAdmin';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectInput, OrchestrationResult } from '../types/orchestrator';

const FALLBACK_IMAGES = [
  'https://shotstack-assets.s3.amazonaws.com/images/realestate1.jpg',
  'https://shotstack-assets.s3.amazonaws.com/images/realestate2.jpg',
  'https://shotstack-assets.s3.amazonaws.com/images/realestate3.jpg'
];

const FALLBACK_AUDIO = 'https://shotstack-assets.s3.amazonaws.com/music/disco.mp3';

export class ProductionCoordinator {
  async orchestrate(input: ProjectInput): Promise<OrchestrationResult> {
    const correlationId = uuidv4();
    const jobId = uuidv4();

    try {
      console.log(`[Coordinator] Starting job ${jobId}`);

      // 1. მომხმარებლის შექმნა ან განახლება
      await supabaseAdmin.from('profiles').upsert({
        id: input.userId,
        email: `user-${input.userId}@avatarg.ai`,
        tier: 'FREE',
        credits_balance: 100
      }, { onConflict: 'id', ignoreDuplicates: true });

      // 2. დავალების (Job) ჩაწერა ბაზაში
      const { error: jobError } = await supabaseAdmin.from('jobs').insert({
        id: jobId,
        user_id: input.userId,
        status: 'queued',
        correlation_id: correlationId,
        input_json: input
      });

      if (jobError) throw jobError;

      // ასინქრონული დამუშავების დაწყება
      this.processJob(jobId, input).catch(err => {
        console.error(`[Coordinator] Job ${jobId} processing failed:`, err);
      });

      return { success: true, jobId, correlationId };
    } catch (error: any) {
      console.error('[Coordinator] Orchestration failed:', error);
      return { success: false, jobId, correlationId, error: error.message };
    }
  }

  private async processJob(jobId: string, input: ProjectInput): Promise<void> {
    try {
      await this.updateJobStatus(jobId, 'running');

      // STEP 1: Script Generation (DeepSeek)
      await this.createJobStep(jobId, 'generate_script', 'running');
      const script = await this.generateScript(jobId, input.userPrompt);
      await this.updateJobStep(jobId, 'generate_script', 'succeeded');

      // STEP 2: Visual Prompts (Gemini)
      await this.createJobStep(jobId, 'generate_visuals', 'running');
      const visualPrompts = await this.generateVisualPrompts(jobId, script);
      await this.updateJobStep(jobId, 'generate_visuals', 'succeeded');

      // STEP 3: Asset Acquisition
      await this.createJobStep(jobId, 'generate_assets', 'running');
      const assets = await this.getAssets(jobId);
      await this.updateJobStep(jobId, 'generate_assets', 'succeeded');

      // STEP 4: Timeline Construction
      await this.createJobStep(jobId, 'build_timeline', 'running');
      const timeline = await this.buildTimeline(jobId, assets, script);
      await this.updateJobStep(jobId, 'build_timeline', 'succeeded');

      // STEP 5: Shotstack Render Submission
      await this.createJobStep(jobId, 'shotstack_render', 'running');
      const renderId = await this.submitShotstackRender(jobId, timeline);
      await this.updateJobStep(jobId, 'shotstack_render', 'succeeded');

      await this.updateJobStatus(jobId, 'waiting_provider', {
        shotstack_render_id: renderId,
        timeline_json: timeline
      });

      // ვიწყებთ ვიდეოს მზაობის შემოწმებას (Polling)
      this.pollShotstackStatus(jobId, renderId).catch(err => {
        console.error(`[Job ${jobId}] Polling error:`, err);
      });

    } catch (error: any) {
      console.error(`[Job ${jobId}] Critical Error:`, error);
      await this.updateJobStatus(jobId, 'failed', null, {
        code: 'PROCESSING_ERROR',
        message: error.message
      });
    }
  }

  private async generateScript(jobId: string, prompt: string): Promise<string> {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) return this.getFallbackScript(jobId, prompt, "Key Missing");

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a professional video scriptwriter. Create a concise 15-second video script with 3 scenes. Each scene 5s.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500
        })
      });

      if (response.status === 402) return this.getFallbackScript(jobId, prompt, "Insufficient Balance");
      if (!response.ok) throw new Error(`DeepSeek API Error: ${response.status}`);

      const data = await response.json();
      const content = data.choices[0].message.content;
      await this.createArtifact(jobId, 'script', null, { content, provider: 'deepseek' });
      return content;
    } catch (error: any) {
      return this.getFallbackScript(jobId, prompt, error.message);
    }
  }

  private async generateVisualPrompts(jobId: string, script: string): Promise<string[]> {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return ['Cinematic scene 1', 'Cinematic scene 2', 'Cinematic scene 3'];

    try {
      // FIXED: მოდელის სახელი 404-ის გამოსარიცხად
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Based on this script, generate 3 cinematic image prompts as a JSON array: ${script}. Output only the array.` }]
          }]
        })
      });

      if (!response.ok) throw new Error(`Gemini Error: ${response.status}`);

      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      const match = text.match(/\[.*\]/s);
      const prompts = match ? JSON.parse(match[0]) : ['Scene 1', 'Scene 2', 'Scene 3'];
      
      await this.createArtifact(jobId, 'visual_prompt', null, { prompts, provider: 'gemini' });
      return prompts;
    } catch (error: any) {
      console.error("Gemini failed, using generic prompts:", error.message);
      return ['Dramatic visual 1', 'Dynamic visual 2', 'Epic visual 3'];
    }
  }

  private async getAssets(jobId: string) {
    const images = FALLBACK_IMAGES.slice(0, 3);
    const audio = FALLBACK_AUDIO;
    for (const img of images) await this.createArtifact(jobId, 'image', img, { source: 'stock' });
    await this.createArtifact(jobId, 'audio', audio, { source: 'stock' });
    return { images, audio };
  }

  private async buildTimeline(jobId: string, assets: any, script: string) {
    const timeline = {
      timeline: {
        tracks: [
          {
            clips: assets.images.map((src: string, i: number) => ({
              asset: { type: 'image', src },
              start: i * 5,
              length: 5,
              transition: { in: 'fade', out: 'fade' },
              effect: i === 0 ? 'zoomIn' : i === 1 ? 'slideRight' : 'zoomOut'
            }))
          },
          {
            clips: [{ asset: { type: 'audio', src: assets.audio }, start: 0, length: 15, volume: 0.5 }]
          }
        ]
      },
      output: { format: 'mp4', resolution: 'sd' }
    };
    await this.createArtifact(jobId, 'shotstack_timeline', null, timeline);
    return timeline;
  }

  private async submitShotstackRender(jobId: string, timeline: any): Promise<string> {
    const apiKey = process.env.SHOTSTACK_API_KEY;
    if (!apiKey) throw new Error('SHOTSTACK_API_KEY missing');

    const response = await fetch('https://api.shotstack.io/v1/render', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(timeline)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Shotstack failed: ${JSON.stringify(data)}`);
    return data.response.id;
  }

  private async pollShotstackStatus(jobId: string, renderId: string) {
    const apiKey = process.env.SHOTSTACK_API_KEY;
    let attempts = 0;
    const maxAttempts = 40;

    const check = async () => {
      attempts++;
      const response = await fetch(`https://api.shotstack.io/v1/render/${renderId}`, {
        headers: { 'x-api-key': apiKey! }
      });
      const data = await response.json();
      const { status, url } = data.response;

      if (status === 'done' && url) {
        await this.updateJobStatus(jobId, 'completed', { video_url: url, shotstack_render_id: renderId });
      } else if (status === 'failed' || attempts >= maxAttempts) {
        await this.updateJobStatus(jobId, 'failed', null, { code: 'RENDER_ERROR', message: 'Video generation failed or timed out' });
      } else {
        setTimeout(check, 5000);
      }
    };
    setTimeout(check, 5000);
  }

  private getFallbackScript(jobId: string, prompt: string, reason: string): string {
    console.warn(`[Job ${jobId}] Fallback Script used. Reason: ${reason}`);
    return `Scene 1: Introduction to ${prompt} (5s). Scene 2: Detailed overview (5s). Scene 3: Conclusion (5s).`;
  }

  private async createJobStep(jobId: string, stepName: string, status: string) {
    await supabaseAdmin.from('job_steps').insert({ job_id: jobId, step_name: stepName, status, started_at: new Date().toISOString() });
  }

  private async updateJobStep(jobId: string, stepName: string, status: string) {
    await supabaseAdmin.from('job_steps').update({ status, finished_at: new Date().toISOString() }).eq('job_id', jobId).eq('step_name', stepName);
  }

  private async updateJobStatus(jobId: string, status: string, outputJson?: any, error?: any) {
    await supabaseAdmin.from('jobs').update({ 
      status, 
      output_json: outputJson, 
      error_code: error?.code, 
      error_message: error?.message,
      completed_at: (status === 'completed' || status === 'failed') ? new Date().toISOString() : null
    }).eq('id', jobId);
  }

  private async createArtifact(jobId: string, type: string, url: string | null, metadata: any) {
    await supabaseAdmin.from('artifacts').insert({ job_id: jobId, type, url, content_json: metadata });
  }

  async getJobStatus(jobId: string) {
    const { data: job } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single();
    if (!job) throw new Error('Job not found');
    return {
      jobId: job.id,
      status: job.status,
      videoUrl: job.output_json?.video_url,
      progress: job.status === 'completed' ? 1 : job.status === 'failed' ? 0 : 0.5,
      error: job.error_code ? { code: job.error_code, message: job.error_message } : undefined
    };
  }
}
