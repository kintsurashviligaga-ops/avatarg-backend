import OpenAI from "openai";

export const runtime = "edge";

// ===============================
// OpenAI client
// ===============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===============================
// CORS
// ===============================
const ALLOWED_ORIGIN =
  process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "*";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGIN === "*" ? "*" : origin || ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

// ===============================
// OPTIONS (preflight)
// ===============================
export async function OPTIONS(req) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

// ===============================
// POST /api/ai
// ===============================
export async function POST(req) {
  const origin = req.headers.get("origin");

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages[] required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders(origin),
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ===== OpenAI stream =====
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      stream: true,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("AI route error:", err);

    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "application/json",
        },
      }
    );
  }
}
