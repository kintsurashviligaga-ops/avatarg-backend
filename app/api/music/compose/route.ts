import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  prompt: string;                 // required
  music_length_ms?: number;       // 3000 - 600000 (depends on provider)
  output_format?: string;         // optional: "mp3_44100_128" etc
  model_id?: string;              // optional
  force_instrumental?: boolean;   // optional
};

function jsonError(message: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const musicUrl = process.env.ELEVENLABS_MUSIC_URL;

    if (!apiKey) return jsonError("Missing ELEVENLABS_API_KEY", 500);
    if (!musicUrl) return jsonError("Missing ELEVENLABS_MUSIC_URL", 500);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return jsonError("Invalid JSON body. Use raw JSON.", 400);
    }

    if (!body?.prompt || typeof body.prompt !== "string") {
      return jsonError("Field 'prompt' is required (string).", 400);
    }

    const payload = {
      prompt: body.prompt,
      music_length_ms: body.music_length_ms ?? 30000,
      output_format: body.output_format ?? "mp3",
      model_id: body.model_id ?? "music_v1",
      force_instrumental: body.force_instrumental ?? false,
    };

    const res = await fetch(musicUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // ElevenLabs ზოგჯერ ითხოვს "xi-api-key"
        "xi-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return jsonError("Music provider error", 502, {
        status_code: res.status,
        provider_response: text?.slice(0, 2000),
      });
    }

    const ct = res.headers.get("content-type") || "";

    // 1) თუ provider აბრუნებს პირდაპირ audio bytes:
    if (ct.includes("audio/") || ct.includes("application/octet-stream")) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": ct.includes("audio/") ? ct : "audio/mpeg",
          "Cache-Control": "no-store",
          // optionally: return as file
          // "Content-Disposition": `attachment; filename="track.mp3"`,
        },
      });
    }

    // 2) თუ provider აბრუნებს JSON (მაგ: base64 ან url)
    const data = await res.json().catch(() => null);
    if (!data) return jsonError("Provider returned non-JSON response", 502);

    return NextResponse.json(
      {
        ok: true,
        provider: "elevenlabs",
        data,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
