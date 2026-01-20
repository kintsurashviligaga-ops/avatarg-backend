import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { runPentagonPipeline } = await import('@/lib/orchestrator/coordinator');
    
    const body = await request.json();
    const userId = body.userId || 'anonymous';
    const userPrompt = body.userPrompt || '';
    
    if (!userPrompt) {
      return NextResponse.json(
        { success: false, error: 'Missing userPrompt' },
        { status: 400 }
      );
    }

    const requestId = generateRequestId();

    const result = await runPentagonPipeline({
      requestId: requestId,
      userPrompt: userPrompt,
      constraints: {
        maxScenes: body.maxScenes || 8,
        maxDurationSec: body.maxDurationSec || 180,
        style: body.style,
      },
    });

    return NextResponse.json({
      success: true,
      jobId: result.requestId,
      correlationId: result.requestId,
      result: result,
    });
  } catch (error: any) {
    console.error('Pentagon pipeline error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Pipeline failed',
        code: error.code || 'UNKNOWN',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'Missing jobId parameter' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    jobId: jobId,
    status: 'completed',
    progress: 1.0,
    message: 'Pentagon pipeline result available',
  });
}

function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return 'req-' + String(timestamp) + '-' + String(random);
}
