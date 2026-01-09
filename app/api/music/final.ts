import type { NextApiRequest, NextApiResponse } from "next";

const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, mood = "cinematic", genre = "electronic", duration = 20 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const finalPrompt = `
Create a ${duration}-second ${genre} instrumental track.
Mood: ${mood}.
Style: modern, high quality, emotional.
Concept: ${prompt}.
No vocals unless specified.
`;

    const response = await fetch(
      "https://api.elevenlabs.io/v1/music/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVEN_API_KEY as string,
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          duration_seconds: duration,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      audioUrl: data.audio_url,
      prompt: finalPrompt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
