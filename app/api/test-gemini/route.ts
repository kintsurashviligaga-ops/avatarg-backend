import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ 
      success: false, 
      error: 'GEMINI_API_KEY not configured' 
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Say "Gemini API works perfectly!"' }]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        success: false, 
        error: `API Error ${response.status}: ${errorText}` 
      });
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;

    return NextResponse.json({ 
      success: true, 
      response: content 
    });

  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: `Connection error: ${error.message}` 
    });
  }
}
