import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  prompt: string;                 // required
  music_length_ms?: number;       // 3000 - 600000
  output_format?: string;         // e.g. "mp3_44100_128"
  model_id?: string;              // default "music_v1"
  force_instrumental?: boolean;   // default false
  sign_with_c2pa?: boolean;       // default false
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 400 });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body", hint: "Make sure Content-Type: application/json and body is valid JSON" },
        { status: 400 }
      );
    }

    if (!body?.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt is required (string)" }, { status: 422 });
    }

    const payload = {
      prompt: body.prompt.slice(0, 4100),
      music_length_ms: Math.min(Math.max(body.music_length_ms ?? 30000, 3000), 600000),
      model_id: body.model_id ?? "music_v1",
      force_instrumental: body.force_instrumental ?? false,
      respect_sections_durations: true,
      store_for_inpainting: false,
      sign_with_c2pa: body.sign_with_c2pa ?? false,
    };

    const outputFormat = body.output_format ?? "mp3_44100_128";

    const r = await fetch(`https://api.elevenlabs.io/v1/music?output_format=${encodeURIComponent(outputFormat)}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return NextResponse.json(
        { error: "ElevenLabs music compose failed", status: r.status, details: txt },
        { status: 502 }
      );
    }

    const audioBuffer = Buffer.from(await r.arrayBuffer());

    // mp3 output
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": outputFormat.startsWith("mp3") ? "audio/mpeg" : "audio/wav",
        "Content-Disposition": `inline; filename="avatarG_music.${outputFormat.startsWith("mp3") ? "mp3" : "wav"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: String(e?.message ?? e) }, { status: 500 });
  }
}
