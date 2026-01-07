import OpenAI from "openai";
import { corsHeaders } from "../_utils/cors";

export async function POST(req) {
  try {
    // Parse body safely
    const body = await req.json().catch(() => ({}));
    const message =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.input === "string"
        ? body.input
        : "";

    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "OPENAI_API_KEY missing" }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (!message.trim()) {
      return new Response(
        JSON.stringify({ ok: true, reply: "Write a message and I will answer." }),
        { status: 200, headers: corsHeaders }
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: message }],
      temperature: 0.6,
    });

    const reply = completion?.choices?.[0]?.message?.content || "No reply.";

    return new Response(
      JSON.stringify({ ok: true, reply }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("AI ROUTE ERROR:", err);

    return new Response(
      JSON.stringify({
        ok: false,
        error: "AI route crashed",
        detail: String(err?.message || err),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// CORS preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
