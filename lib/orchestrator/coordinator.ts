export class ProductionCoordinator {
  async orchestrate({ userId, userPrompt }: any) {
    console.log(`[Director] Grok is taking command for prompt: ${userPrompt}`);
    
    try {
      // ნაბიჯი 1: Grok-ი ერთდროულად წერს სცენარსაც და ვიდეო-პრომპტსაც
      const directorOutput = await this.askGrokToProduce(userPrompt);
      
      // ნაბიჯი 2: Pollinations აგენერირებს ვიდეოს (უფასოდ)
      // ვიყენებთ Grok-ის მიერ ოპტიმიზირებულ პრომპტს
      const finalVideoUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(directorOutput.videoPrompt)}?model=video&width=1280&height=720&seed=${Math.floor(Math.random() * 1000000)}`;

      return {
        id: `job_${Date.now()}`,
        status: 'completed',
        creative_script: directorOutput.story,
        video_url: finalVideoUrl,
        director_notes: directorOutput.videoPrompt
      };
    } catch (error: any) {
      console.error("[Director] Error:", error);
      return { success: false, error: error.message };
    }
  }

  async askGrokToProduce(userPrompt: string) {
    const apiKey = process.env.XAI_API_KEY;
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [
          { 
            role: 'system', 
            content: 'You are a Creative Director. Based on the user prompt, provide a JSON response with two fields: "story" (a short creative story in Georgian) and "videoPrompt" (a detailed English prompt for AI video generation including lighting and camera movements).' 
          },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" } // Grok დაგვიბრუნებს სუფთა მონაცემებს
      })
    });
    
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  // სტატუსის მეთოდი Build-ისთვის
  async getJobStatus(jobId: string) {
    return { id: jobId, status: 'completed' };
  }
}
