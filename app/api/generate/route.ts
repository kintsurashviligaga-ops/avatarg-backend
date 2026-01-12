import { NextRequest, NextResponse } from "next/server";
import * as fal from "@fal-ai/client";

export const runtime = "edge";

/**
 * ENV required:
 *  - FAL_KEY = your fal.ai api key (starts with "fal_")
 *
 * Body:
 *  {
 *    "prompt": "Georgian New Year vibe, upbeat pop, festive, 120bpm, joyful chorus",
 *    "lyrics": "optional full lyrics",
 *    "duration": 30,         // optional (seconds)
 *    "format": "mp3"         // optional
 *  }
 */
export async function POST(req: NextRequest) {
  try {
    const FAL_KEY = process.env.FAL_KEY;

    if (!FAL_KEY) {
      return NextResponse.json(
        { error: "FAL_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt ?? "").trim();
    const lyrics = body?.lyrics ? String(body.lyrics).trim() : "";
    const duration = Number(body?.duration ?? 30);
    const format = (String(body?.format ?? "mp3") as "mp3" | "wav").toLowerCase();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    // Configure fal client
    fal.config({ credentials: FAL_KEY });

    /**
     * მუსიკის გენერაცია (Suno-ს ალტერნატივა)
     * fal.ai-ზე მოდელები იცვლება დროთა განმავლობაში,
     * ამიტომ აქ გვაქვს fallback-ები:
     * 1) stable-audio (თუ გაქვს)
     * 2) musicgen (fallback)
     */
    const combinedPrompt = lyrics
      ? `${prompt}\n\nLYRICS:\n${lyrics}`
      : prompt;

    const tryModels = [
      "fal-ai/stable-audio",        // პირველ რიგში
      "fal-ai/musicgen"             // fallback
    ];

    let result: any = null;
    let lastErr: any = null;

    for (const model of tryModels) {
      try {
        result = await fal.subscribe(model, {
          input: {
            prompt: combinedPrompt,
            duration: Math.max(5, Math.min(120, duration)),
            format: format === "wav" ? "wav" : "mp3"
          }
        });
        if (result) break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!result) {
      return NextResponse.json(
        {
          error: "Music generation failed",
          details: lastErr?.message ?? String(lastErr ?? "Unknown error")
        },
        { status: 500 }
      );
    }

    /**
     * fal result formats differ by model.
     * Usually:
     * - result.data.audio.url
     * - or result.data.audio[0].url
     */
    const data = result?.data ?? result;
    const audioUrl =
      data?.audio?.url ??
      data?.audio?.[0]?.url ??
      data?.output?.audio_url ??
      data?.output?.url ??
      null;

    if (!audioUrl) {
      return NextResponse.json(
        { error: "No audio URL returned", raw: data },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        model_used: result?.model ?? undefined,
        audio_url: audioUrl
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
