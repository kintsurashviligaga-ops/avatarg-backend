// app/api/ai/route.js
import { NextResponse } from "next/server";

// --- CORS (მარტივი და საიმედო) ---
function corsHeaders(req) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// თუ ბრაუზერიდან გახსნი /api/ai, 405-ის ნაცვლად დაგიბრუნებს გზავნილს
export async function GET(req) {
  return NextResponse.json(
    { status: "ok", note: "Use POST with JSON: { messages: [...] }" },
    { headers: corsHeaders(req) }
  );
}

export async function POST(req) {
  try {
    const headers = corsHeaders(req);

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY on server (Vercel env var)." },
        { status: 500, headers }
      );
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    const prompt = typeof body?.prompt === "string" ? body.prompt : null;

    // Flex input:
    // 1) { messages: [{role:'user', content:'...'}] }
    // 2) { prompt: "..." }
    const finalMessages =
      messages ??
      (prompt
        ? [{ role: "user", content: prompt }]
        : [{ role: "user", content: "Hello from Avatar G." }]);

    // OpenAI Responses API (სერვერზე)
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body?.model || "gpt-4o-mini",
        input: finalMessages,
      }),
    });

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      return NextResponse.json(
        {
          error: "OpenAI request failed",
          status: r.status,
          details: data,
        },
        { status: 500, headers }
      );
    }

    // Responses API პასუხიდან ტექსტის ამოღება (სტაბილური fallback-ებით)
    const text =
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      data?.response?.output_text ||
      "";

    return NextResponse.json(
      {
        status: "ok",
        text,
        raw: body?.debug ? data : undefined,
      },
      { headers }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Server error", message: String(err?.message || err) },
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
