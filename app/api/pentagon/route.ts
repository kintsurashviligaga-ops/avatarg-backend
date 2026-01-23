import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Health check (used by UI "Endpoint Check")
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'Avatar G Pentagon Backend',
      route: '/api/pentagon',
      mode: 'direct-backend',
      ts: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

/**
 * Main Pentagon pipeline endpoint
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const { userPrompt, constraints } = payload;

    if (!userPrompt || typeof userPrompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing userPrompt' },
        { status: 400 }
      );
    }

    // ---- STEP 1: Structure ----
    // (later you will replace this with real LLM calls)
    const structure = {
      scenes: constraints?.maxScenes ?? 5,
      duration: constraints?.maxDurationSec ?? 15,
      style: constraints?.style ?? 'cinematic',
    };

    // ---- STEP 2: Simulated render job ----
    // This is intentionally simple & stable for now
    const renderJobId = `job_${Date.now()}`;

    // ---- STEP 3: Temporary video URL (stub) ----
    // Replace later with real render output
    const finalVideoUrl =
      'https://www.w3schools.com/html/mov_bbb.mp4';

    return NextResponse.json(
      {
        success: true,
        renderJobId,
        structure,
        finalVideoUrl,
        note: 'Backend executed directly (no proxy)',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Pentagon backend failed',
      },
      { status: 500 }
    );
  }
}
