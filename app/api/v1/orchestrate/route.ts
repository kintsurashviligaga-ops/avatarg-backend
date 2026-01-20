import { NextRequest, NextResponse } from 'next/server';
import { ProductionCoordinator } from '@/lib/orchestrator/coordinator';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userPrompt, brandContext } = body;

    // Create project
    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: `Project ${Date.now()}`,
        user_prompt: userPrompt,
        brand_context: brandContext,
        status: 'draft'
      })
      .select()
      .single();

    if (error) throw error;

    // Start orchestration
    const coordinator = new ProductionCoordinator();
    const result = await coordinator.orchestrate({
      userId,
      projectId: project.id,
      userPrompt,
      brandContext
    });

    return NextResponse.json(result);

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
