import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'API Key missing' });

  // მოდელების სია სატესტოდ
  const models = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-pro'];
  let lastError = '';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ 
          success: true, 
          model_used: model,
          response: data.candidates[0].content.parts[0].text 
        });
      }
      const errData = await response.json();
      lastError = errData.error?.message || 'Unknown error';
    } catch (e: any) {
      lastError = e.message;
    }
  }

  return NextResponse.json({ success: false, error: `None of the models worked. Last error: ${lastError}` });
}
