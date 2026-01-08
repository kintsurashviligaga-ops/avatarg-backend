import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  title?: string;
  style?: string;
  language?: "English" | "Georgian" | "Russian";
  mood?: string;
  theme?: string;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  try {
    // ✅ Robust JSON parsing (works even if Content-Type is wrong)
    const raw = await req.text();
    let body: Body = {};
    try {
      body = raw ? (JSON.parse(raw) as Body) : {};
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON body",
          hint: 'Make sure Postman Body is raw JSON and header Content-Type = application/json',
          received: raw?.slice(0, 500) ?? "",
        },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ✅ Defaults
    const title = (body.title || "Avatar G — Suno Track").toString().slice(0, 120);
    const style = (body.style || "Upbeat, catchy, modern pop").toString().slice(0, 220);
    const language = (body.language || "English") as Body["language"];
    const mood = (body.mood || "Happy, uplifting, confident").toString().slice(0, 160);
    const theme = (body.theme || "Avatar G app advertisement, futuristic, premium").toString().slice(0, 240);

    // ✅ Call OpenAI (you already use OPENAI_API_KEY in Vercel env)
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const system =
      `You write original song lyrics for Suno users.
Return JSON only with keys: lyrics, sunoPrompt, meta.
- lyrics: structured for Suno (Intro/Verse/Chorus/Bridge/Outro), ad-friendly, no profanity, no explicit content.
- sunoPrompt: one compact Suno prompt describing style, vocals, instrumentation, tempo, mood, language.
Keep it catchy, premium, modern.`;

    const user =
      `Make an advertising song for "Avatar G" app.

Title: ${title}
Language: ${language}
Style: ${style}
Mood: ${mood}
Theme: ${theme}

Return JSON ONLY with:
{
  "lyrics": "...",
  "sunoPrompt": "...",
  "meta": { "title": "...", "language": "...", "style": "...", "mood": "...", "theme": "..." }
}
`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: "OpenAI error", details: data },
        { status: 500, headers: corsHeaders() }
      );
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Empty response from OpenAI" },
        { status: 500, headers: corsHeaders() }
      );
    }

    // content is JSON string (because response_format=json_object)
    const parsed = JSON.parse(content);

    return NextResponse.json(
      {
        ...parsed,
        meta: {
          title,
          language,
          style,
          mood,
          theme,
          ...(parsed.meta || {}),
        },
      },
      { status: 200, headers: corsHeaders() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: e?.message || String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }
}
