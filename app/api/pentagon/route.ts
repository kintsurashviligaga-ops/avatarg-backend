import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { userPrompt, constraints } = body;

    if (!userPrompt) {
      return NextResponse.json(
        { success: false, error: 'userPrompt is required' },
        { status: 400 }
      );
    }

    // 🔹 დროებითი MOCK პასუხი (ტესტისთვის)
    // შემდეგ აქ ჩასვამ რეალურ pipeline-ს
    return NextResponse.json({
      success: true,
      renderJobId: 'test-job-' + Date.now(),
      finalVideoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      meta: {
        stageTimingsMs: {
          structure: 500,
          localization: 800,
          voiceover: 1200,
          visuals: 1500,
          render: 2000,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
