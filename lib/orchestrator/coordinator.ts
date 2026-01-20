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

      // AUTO-CREATE USER IF NOT EXISTS
      const { error: userError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: input.userId,
          email: `user-${input.userId}@avatarg.ai`,
          tier: 'FREE',
          credits_balance: 100
        }, {
          onConflict: 'id',
          ignoreDuplicates: true
        });

      if (userError) {
        console.warn('[Coordinator] User creation warning:', userError);
      }

      // Create job record
      const { error: jobError } = await supabaseAdmin.from('jobs').insert({
        id: jobId,
        user_id: input.userId,
        status: 'queued',
        correlation_id: correlationId,
        input_json: input
      });

      if (jobError) {
        console.error('[Coordinator] Job creation error:', jobError);
        throw jobError;
      }

      // Start async processing (don't await)
      this.processJob(jobId, input).catch(err => {
        console.error(`[Coordinator] Job ${jobId} processing failed:`, err);
      });

      return {
        success: true,
        jobId,
        correlationId
      };
    } catch (error: any) {
      console.error('[Coordinator] Orchestration failed:', error);
      return {
        success: false,
        jobId,
        correlationId,
        error: error.message
      };
    }
  }

  private async processJob(jobId: string, input: ProjectInput): Promise<void> {
    try {
      await this.updateJobStatus(jobId, 'running');

      // STEP 1: Generate script
      console.log(`[Job ${jobId}] Step 1: Generating script`);
      await this.createJobStep(jobId, 'generate_script', 'running');
      const script = await this.generateScript(jobId, input.userPrompt);
      await this.updateJobStep(jobId, 'generate_script', 'succeeded');

      // STEP 2: Generate visual prompts
      console.log(`[Job ${jobId}] Step 2: Generating visual prompts`);
      await this.createJobStep(jobId, 'generate_visuals', 'running');
      const visualPrompts = await this.generateVisualPrompts(jobId, script);
      await this.updateJobStep(jobId, 'generate_visuals', 'succeeded');

      // STEP 3: Get assets (fallbacks in sandbox)
      console.log(`[Job ${jobId}] Step 3: Getting assets`);
      await this.createJobStep(jobId, 'generate_assets', 'running');
      const assets = await this.getAssets(jobId);
      await this.updateJobStep(jobId, 'generate_assets', 'succeeded');

      // STEP 4: Build timeline
      console.log(`[Job ${jobId}] Step 4: Building timeline`);
      await this.createJobStep(jobId, 'build_timeline', 'running');
      const timeline = await this.buildTimeline(jobId, assets, script);
      await this.updateJobStep(jobId, 'build_timeline', 'succeeded');

      // STEP 5: Submit to Shotstack
      console.log(`[Job ${jobId}] Step 5: Submitting to Shotstack`);
      await this.createJobStep(jobId, 'shotstack_render', 'running');
      const renderId = await this.submitShotstackRender(jobId, timeline);
      await this.updateJobStep(jobId, 'shotstack_render', 'succeeded');

      await this.updateJobStatus(jobId, 'waiting_provider', {
        shotstack_render_id: renderId,
        timeline_json: timeline
      });

      console.log(`[Job ${jobId}] Submitted to Shotstack: ${renderId}`);

      // Sandbox: simulate completion after 5 seconds
      setTimeout(async () => {
        await this.updateJobStatus(jobId, 'completed');
        console.log(`[Job ${jobId}] Marked as completed (sandbox mode)`);
      }, 5000);

    } catch (error: any) {
      console.error(`[Job ${jobId}] Processing error:`, error);
      await this.updateJobStatus(jobId, 'failed', null, {
        code: 'PROCESSING_ERROR',
        message: error.message
      });
    }
  }

  private async generateScript(jobId: string, prompt: string): Promise<string> {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    if (!deepseekKey) {
      console.log(`[Job ${jobId}] DeepSeek key missing, using fallback script`);
      const fallback = `Scene 1: ${prompt}. Duration: 5 seconds.\nScene 2: Continuation of the theme. Duration: 5 seconds.\nScene 3: Conclusion with impact. Duration: 5 seconds.`;
      await this.createArtifact(jobId, 'script', null, { content: fallback, source: 'fallback' });
      return fallback;
    }

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deepseekKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are a professional video scriptwriter. Create a concise 15-second video script with 3 scenes. Each scene should have a description and 5-second duration.'
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      await this.createArtifact(jobId, 'script', null, { content, provider: 'deepseek' });
      return content;
    } catch (error: any) {
      console.error(`[Job ${jobId}] DeepSeek error, using fallback:`, error.message);
      const fallback = `Scene 1: ${prompt}. Duration: 5 seconds.\nScene 2: Development. Duration: 5 seconds.\nScene 3: Conclusion. Duration: 5 seconds.`;
      await this.createArtifact(jobId, 'script', null, { content: fallback, source: 'fallback' });
      return fallback;
    }
  }

  private async generateVisualPrompts(jobId: string, script: string): Promise<string[]> {
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      console.log(`[Job ${jobId}] Gemini key missing, using fallback prompts`);
      const fallback = ['Professional scene 1', 'Professional scene 2', 'Professional scene 3'];
      await this.createArtifact(jobId, 'visual_prompt', null, { prompts: fallback, source: 'fallback' });
      return fallback;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{
              text: `Based on this video script, generate exactly 3 image generation prompts as a JSON array. Each prompt should describe a key visual scene.\n\nScript:\n${script}\n\nOutput only a JSON array like: ["prompt 1", "prompt 2", "prompt 3"]`
            }]
          }],
          generationConfig: {
            maxOutputTokens: 400,
            temperature: 0.7
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      const match = text.match(/\[.*\]/s);
      const prompts = match ? JSON.parse(match[0]) : ['Scene 1', 'Scene 2', 'Scene 3'];

      await this.createArtifact(jobId, 'visual_prompt', null, { prompts, provider: 'gemini' });
      return prompts;
    } catch (error: any) {
      console.error(`[Job ${jobId}] Gemini error, using fallback:`, error.message);
      const fallback = ['Professional scene 1', 'Professional scene 2', 'Professional scene 3'];
      await this.createArtifact(jobId, 'visual_prompt', null, { prompts: fallback, source: 'fallback' });
      return fallback;
    }
  }

  private async getAssets(jobId: string): Promise<{ images: string[]; audio: string }> {
    console.log(`[Job ${jobId}] Using fallback assets (sandbox mode)`);
    
    const images = FALLBACK_IMAGES.slice(0, 3);
    const audio = FALLBACK_AUDIO;

    for (const img of images) {
      await this.createArtifact(jobId, 'image', img, { source: 'fallback' });
    }
    await this.createArtifact(jobId, 'audio', audio, { source: 'fallback' });

    return { images, audio };
  }

  private async buildTimeline(jobId: string, assets: any, script: string): Promise<any> {
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
            clips: [{
              asset: { type: 'audio', src: assets.audio },
              start: 0,
              length: 15,
              volume: 0.5
            }]
          }
        ]
      },
      output: {
        format: 'mp4',
        resolution: 'sd'
      }
    };

    await this.createArtifact(jobId, 'shotstack_timeline', null, timeline);
    return timeline;
  }

  private async submitShotstackRender(jobId: string, timeline: any): Promise<string> {
    const apiKey = process.env.SHOTSTACK_API_KEY;

    if (!apiKey) {
      throw new Error('SHOTSTACK_API_KEY not configured');
    }

    const response = await fetch('https://api.shotstack.io/v1/render', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(timeline)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shotstack error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.response.id;
  }

  private async createJobStep(jobId: string, stepName: string, status: string) {
    await supabaseAdmin.from('job_steps').insert({
      job_id: jobId,
      step_name: stepName,
      status,
      started_at: status === 'running' ? new Date().toISOString() : null
    });
  }

  private async updateJobStep(jobId: string, stepName: string, status: string) {
    await supabaseAdmin
      .from('job_steps')
      .update({
        status,
        finished_at: status === 'succeeded' || status === 'failed' ? new Date().toISOString() : null
      })
      .eq('job_id', jobId)
      .eq('step_name', stepName);
  }

  private async updateJobStatus(
    jobId: string,
    status: string,
    outputJson?: any,
    error?: { code: string; message: string }
  ) {
    await supabaseAdmin.from('jobs').update({
      status,
      output_json: outputJson,
      error_code: error?.code,
      error_message: error?.message,
      current_step: status === 'running' ? 'processing' : null,
      completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null
    }).eq('id', jobId);
  }

  private async createArtifact(jobId: string, type: string, url: string | null, metadata: any) {
    await supabaseAdmin.from('artifacts').insert({
      job_id: jobId,
      type,
      url,
      content_json: metadata
    });
  }

  async getJobStatus(jobId: string): Promise<any> {
    const { data: job, error } = await supabaseAdmin
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      throw new Error('Job not found');
    }

    const { data: artifacts } = await supabaseAdmin
      .from('artifacts')
      .select('*')
      .eq('job_id', jobId)
      .eq('type', 'shotstack_timeline');

    return {
      jobId: job.id,
      status: job.status,
      progress: this.calculateProgress(job.status),
      currentStep: job.current_step,
      shotstack: job.output_json?.shotstack_render_id ? {
        renderId: job.output_json.shotstack_render_id,
        timelineJson: job.output_json.timeline_json || artifacts?.[0]?.content_json
      } : undefined,
      error: job.error_code ? {
        code: job.error_code,
        message: job.error_message
      } : undefined
    };
  }

  private calculateProgress(status: string): number {
    const map: Record<string, number> = {
      queued: 0.1,
      running: 0.5,
      waiting_provider: 0.8,
      completed: 1.0,
      failed: 0
    };
    return map[status] || 0;
  }
      }
