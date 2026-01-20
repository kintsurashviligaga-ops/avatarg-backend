async generateVideoScript(userPrompt: string) {
  const apiKey = process.env.XAI_API_KEY;
  
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-beta', // ან 'grok-1'
        messages: [
          { 
            role: 'system', 
            content: 'შენ ხარ ვიდეო პროდიუსერი. შექმენი 4 სცენისგან შემდგარი ვიდეო სცენარი. თითოეულ სცენას მიეცი ინგლისური ვიზუალური აღწერა (image prompt).' 
          },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Grok Error:", error);
    // აქ შეგიძლია დატოვო Gemini როგორც Fallback
    return this.fallbackScript(userPrompt);
  }
}
