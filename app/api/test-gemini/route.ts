import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'GEMINI_API_KEY missing' });

  try {
    // ვიყენებთ v1 ვერსიას და სწორ მოდელს: gemini-1.5-flash
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "Gemini API is ready!"' }] }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'API Error');

    return NextResponse.json({ 
      success: true, 
      response: data.candidates[0].content.parts[0].text 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
