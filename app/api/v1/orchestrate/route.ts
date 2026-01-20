import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // დინამიური იმპორტი სწორია
    const { ProductionCoordinator } = await import('@/lib/orchestrator/coordinator');
    
    const body = await request.json();
    
    // ვამატებთ შემოწმებას prompt-ზე (რასაც რეალურად აგზავნის ფორმა)
    const userId = body.userId || 'anonymous';
    const userPrompt = body.userPrompt || body.prompt; 

    if (!userPrompt) {
      return NextResponse.json(
        { error: 'პრომპტი ცარიელია. გთხოვთ შეიყვანოთ დავალება.' },
        { status: 400 }
      );
    }

    const coordinator = new ProductionCoordinator();
    
    // ვიყენებთ startVideoProduction-ს, რადგან coordinator.ts-ში ასე მივუთითეთ
    const result = await coordinator.startVideoProduction(userPrompt, userId);

    return NextResponse.json({
      success: true,
      jobId: result.id,
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
      return NextResponse.json(
        { error: 'Job ID არ არის მითითებული' },
        { status: 400 }
      );
    }

    const coordinator = new ProductionCoordinator();
    const status = await coordinator.getJobStatus(jobId);
    
    return NextResponse.json(status);
  } catch (error: any) {
    console.error('[API] Orchestrate GET error:', error);
    return NextResponse.json(
      { error: 'Job ვერ მოიძებნა ან სისტემური შეცდომაა' },
      { status: 404 }
    );
  }
}
