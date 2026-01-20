import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { runPentagonPipeline } = await import('@/lib/orchestrator/coordinator');
    
    const body = await request.json();
    const userPrompt = body.userPrompt || '';
    
    if (!userPrompt) {
      return NextResponse.json(
        { success: false, error: 'Missing userPrompt' },
        { status: 400 }
      );
    }

    const requestId = generateRequestId();

    console.log('[Pentagon] Starting pipeline:', requestId);

    const result = await runPentagonPipeline({
      requestId: requestId,
      userPrompt: userPrompt,
      constraints: {
        maxScenes: body.maxScenes || 8,
        maxDurationSec: body.maxDurationSec || 180,
        style: body.style,
      },
    });

    console.log('[Pentagon] Pipeline completed:', requestId);

    return NextResponse.json({
      success: true,
      requestId: result.requestId,
      deepseek: result.deepseek,
      gpt: result.gpt,
      gemini: result.gemini,
      grok: result.grok,
      pollinations: result.pollinations,
      meta: result.meta,
    });
  } catch (error: any) {
    console.error('[Pentagon] Pipeline error:', error);
    
    const statusCode = error.code === 'BAD_REQUEST' ? 400 : 500;
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Pipeline failed',
        code: error.code || 'UNKNOWN',
        stage: error.stage || 'unknown',
        retryable: error.retryable || false,
      },
      { status: statusCode }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    name: 'Pentagon Pipeline API',
    version: '1.0.0',
    stages: [
      'DeepSeek - Structure Generation',
      'GPT - Editing & Refinement',
      'Gemini - Georgian Localization',
      'Grok - Visual Prompting',
      'Pollinations - Image Generation',
    ],
    status: 'operational',
  });
}

function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return 'pentagon-' + String(timestamp) + '-' + String(random);
}
