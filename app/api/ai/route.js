import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // დროებით mock პასუხი (OpenAI-ს გარეშე)
    return NextResponse.json({
      success: true,
      input: prompt,
      output: `Avatar G received: "${prompt}"`,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: error.message },
      { status: 500 }
    );
  }
}
