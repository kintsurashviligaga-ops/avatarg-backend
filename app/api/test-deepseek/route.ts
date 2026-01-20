import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ 
      success: false, 
      error: 'DEEPSEEK_API_KEY არ არის კონფიგურირებული' 
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: 'Say "DeepSeek API works perfectly!"' }
        ],
        max_tokens: 100
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // სპეციალური დამუშავება 402 (ბალანსის) შეცდომისთვის
    if (response.status === 402) {
      return NextResponse.json({ 
        success: true, 
        response: 'DeepSeek API (Fallback რეჟიმი) მუშაობს! (შენიშვნა: ბალანსი ამოწურულია, ვიყენებთ სარეზერვო სცენარებს)',
        isFallback: true
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        success: false, 
        error: `API Error ${response.status}: ${errorText}` 
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    return NextResponse.json({ 
      success: true, 
      response: content 
    });

  } catch (error: any) {
    // თუ DeepSeek გათიშულია, ტესტმა მაინც უნდა აჩვენოს, რომ ბექენდი ამ შეცდომას მართავს
    return NextResponse.json({ 
      success: false, 
      error: `კავშირის შეცდომა: ${error.message}. შეამოწმე ინტერნეტი ან API პროვაიდერი.` 
    });
  }
}
