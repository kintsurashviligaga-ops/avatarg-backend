import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { ProductionCoordinator } = await import('@/lib/orchestrator/coordinator');
    
    const body = await request.json();
    const userId = body.userId || 'anonymous';
    const userPrompt = body.userPrompt || body.prompt; 

    if (!userPrompt) {
      return NextResponse.json(
        { error: 'პრომპტი ცარიელია' },
        { status: 400 }
      );
    }

    const coordinator = new ProductionCoordinator();
    
    // აქ შევცვალე 'startVideoProduction' -> 'orchestrate'-ით
    // რადგან შენს ორიგინალ კოორდინატორში ფუნქციას 'orchestrate' ჰქვია
    const result = await coordinator.orchestrate({
      userId,
      userPrompt,
      brandContext: body.brandContext || {}
    });

    return NextResponse.json({
      success: true,
      jobId: result.id || result.jobId,
      status: result.status
    });
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
    const { ProductionCoordinator } = await import('@/lib/orchestrator/coordinator');
    
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const coordinator = new ProductionCoordinator();
    const status = await coordinator.getJobStatus(jobId);
    
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}
