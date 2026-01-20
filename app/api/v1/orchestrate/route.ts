import { NextRequest, NextResponse } from 'next/server';
import { ProductionCoordinator } from '@/lib/orchestrator/coordinator';

const coordinator = new ProductionCoordinator();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userPrompt, brandContext } = body;

    if (!userId || !userPrompt) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and userPrompt' },
        { status: 400 }
      );
    }

    const result = await coordinator.orchestrate({
      userId,
      userPrompt,
      brandContext: brandContext || {}
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Orchestrate POST error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }

    const status = await coordinator.getJobStatus(jobId);
    return NextResponse.json(status);
  } catch (error: any) {
    console.error('[API] Orchestrate GET error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 404 }
    );
  }
}
