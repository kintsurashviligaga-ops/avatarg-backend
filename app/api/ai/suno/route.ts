import { NextResponse } from "next/server";

/**
 * Avatar G — Suno Prompt Generator API
 * Path: /api/ai/suno
 * Method: POST
 *
 * Body:
 * {
 *   "title"?: string,
 *   "style"?: string,
 *   "language"?: "English" | "Georgian" | "Russian",
 *   "mood"?: string,
 *   "theme"?: string
 * }
 *
 * Returns:
 * { lyrics: string, sunoPrompt: string }
 */

export const runtime = "nodejs";

type Body = {
  title?: string;
  style?: string;
  language?: "English" | "Georgian" | "Russian";
  mood?: string;
  theme?: string;
};

function corsHeaders(origin: string | null) {
  // allowlist: set AVATARG_ALLOWED_ORIGINS="https://your-frontend.vercel.app,https://cloud.ai"
  const allowList = (process.env.AVATARG_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin =
    (origin && (allowList.includes(origin) || allowList.includes("*")) && origin) ||
    (allowList.includes("*") ? "*" : allowList[0] || "*");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 400, headers }
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers }
      );
    }

    const title = (body.title || "Avatar G — Suno Track").slice(0, 120);
    const style = (body.style || "Upbeat, catchy, modern pop").slice(0, 220);
    const language = body.language || "English";
    const mood = (body.mood || "Happy, uplifting, confident").slice(0, 160);
    const theme = (body.theme || "Avatar G app advertisement, futuristic, premium").slice(0, 240);

    const system =
      `You write original song lyrics for Suno users.\n` +
      `Return JSON ONLY with keys: lyrics, sunoPrompt.\n` +
      `- lyrics: structured for Suno (Intro/Verse/Chorus/Bridge/Outro), ad-friendly, no profanity, no explicit content.\n` +
      `- sunoPrompt: a single compact Suno prompt describing style, vocals, instrumentation, tempo, mood, language.\n` +
      `Keep it catchy, premium, and suitable for a commercial.\n` +
      `If language is Georgian or Russian, write lyrics fully in that language.\n`;

    const user =
      `Make an advertising song for "Avatar G" app.\n` +
      `Title: ${title}\n` +
      `Language: ${language}\n` +
      `Style: ${style}\n` +
      `Mood: ${mood}\n` +
      `Theme: ${theme}\n` +
      `Output JSON only.\n`;

    // Using OpenAI Chat Completions compatible endpoint.
    // NOTE: If you use a different provider wrapper, adjust URL/model accordingly.
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: "OpenAI request failed", status: resp.status, details: txt.slice(0, 2000) },
        { status: 500, headers }
      );
    }

    const data = await resp.json();

    const content: string | undefined =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No content from model" },
        { status: 500, headers }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Fallback: return raw content
      return NextResponse.json(
        { error: "Model did not return valid JSON", raw: content.slice(0, 4000) },
        { status: 500, headers }
      );
    }

    const lyrics = typeof parsed?.lyrics === "string" ? parsed.lyrics : "";
    const sunoPrompt = typeof parsed?.sunoPrompt === "string" ? parsed.sunoPrompt : "";

    if (!lyrics || !sunoPrompt) {
      return NextResponse.json(
        { error: "Invalid response shape", parsed },
        { status: 500, headers }
      );
    }

    return NextResponse.json(
      { lyrics, sunoPrompt, meta: { title, style, language, mood, theme } },
      { status: 200, headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Server error", details: String(err?.message || err) },
      { status: 500, headers }
    );
  }
    }
