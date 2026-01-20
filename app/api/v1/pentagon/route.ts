import { NextRequest, NextResponse } from 'next/server';
import { runPentagonPipeline } from '@/lib/orchestrator/coordinator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userPrompt, constraints } = body;

    if (!userPrompt) {
      return NextResponse.json(
        { success: false, error: 'Missing userPrompt' },
        { status: 400 }
      );
    }

    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(7);

    const result = await runPentagonPipeline({
      requestId,
      userPrompt,
      constraints,
    });

    return NextResponse.json({
      success: true,
      requestId: result.requestId,
      structure: result.structure,
      edited: result.edited,
      localized: result.localized,
      voiceovers: result.voiceovers,
      visualPrompts: result.visualPrompts,
      videos: result.videos,
      finalVideoUrl: result.finalVideoUrl,
      meta: result.meta,
    });

  } catch (error: any) {
    console.error('Pentagon pipeline error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Pipeline execution failed',
        stage: error.stage || 'unknown',
        code: error.code || 'UNKNOWN',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Pentagon Video Generator API',
    version: '2.0',
    stages: [
      'structure_generation',
      'gpt_edit',
      'georgian_localization',
      'voiceover_generation',
      'visual_prompting',
      'video_rendering',
    ],
    features: [
      'GPT-4o-mini structure generation',
      'Professional editing',
      'Georgian localization',
      'ElevenLabs voiceovers',
      'Grok visual prompts',
      'Pollinations video rendering',
    ],
  });
}
