import { NextResponse } from 'next/server';
import { ProductionCoordinator } from '@/lib/orchestrator/coordinator';

export async function GET() {
  try {
    const coordinator = new ProductionCoordinator();
    
    const result = await coordinator.orchestrate({
      userId: 'test-sandbox-user-' + Date.now(),
      userPrompt: 'Create a 15-second video showcasing beautiful Georgian mountain landscapes',
      brandContext: { test: true, environment: 'sandbox' }
    });

    return NextResponse.json({
      ...result,
      testInfo: {
        message: 'Test job created successfully',
        nextStep: `Poll status at: /api/v1/orchestrate?jobId=${result.jobId}`
      }
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
