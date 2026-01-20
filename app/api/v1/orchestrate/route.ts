import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { ProductionCoordinator } = await import('@/lib/orchestrator/coordinator');
    
    const body = await request.json();
    const userId = body.userId || 'anonymous';
    // ვიღებთ ან userPrompt-ს ან prompt-ს, რაც არ უნდა გამოაგზავნოს ფრონტენდმა
    const userPrompt = body.userPrompt || body.prompt; 

    if (!userPrompt) {
      return NextResponse.json(
        { error: 'პრომპტი ცარიელია' },
        { status: 400 }
      );
    }

    const coordinator = new ProductionCoordinator();
    
    // ვიძახებთ მთავარ ფუნქციას
    const result = await coordinator.orchestrate({
      userId,
      userPrompt,
      brandContext: body.brandContext || {}
    });

    // ვიყენებთ (result as any) რომ TypeScript-მა აღარ დააეროროს Build-ზე
    const finalResult = result as any;

    return NextResponse.json({
      success: true,
      jobId: finalResult.id || finalResult.jobId || finalResult.job_id,
      status: finalResult.status || 'processing'
    });
  } catch (error: any) {
    console.error('[API] Orchestrate POST error:', error);
    return NextResponse.json(
      { error: error.message || 'შიდა სერვერული შეცდომა' },
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
      return NextResponse.json({ error: 'Job ID არ არის მითითებული' }, { status: 400 });
    }

    const coordinator = new ProductionCoordinator();
    const status = await coordinator.getJobStatus(jobId);
    
    if (!status) {
      return NextResponse.json({ error: 'Job ვერ მოიძებნა' }, { status: 404 });
    }
    
    return NextResponse.json(status);
  } catch (error: any) {
    console.error('[API] Orchestrate GET error:', error);
    return NextResponse.json(
      { error: 'სტატუსის შემოწმება ვერ მოხერხდა' }, 
      { status: 500 }
    );
  }
}
