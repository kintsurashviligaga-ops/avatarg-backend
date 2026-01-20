import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ 
      success: false, 
      error: 'GEMINI_API_KEY არ არის კონფიგურირებული' 
    });
  }

  try {
    // შეცვლილი URL: gemini-1.5-flash-latest-ის ნაცვლად ვიყენებთ gemini-1.5-flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Say "Gemini API მუშაობს იდეალურად!"'
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({ 
        success: false, 
        error: `API Error ${response.status}: ${JSON.stringify(errorData)}` 
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
      error: error.message 
    });
  }
}
