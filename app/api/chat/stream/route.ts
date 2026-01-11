import OpenAI from "openai";

export const runtime = "edge";

// =========================
// ✅ OpenAI client (Edge)
// =========================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// =========================
// ✅ CORS (set your frontend URL if you want strict)
// =========================
const ALLOWED_ORIGIN =
  process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "*";

function corsHeaders(origin?: string) {
  const o = origin && ALLOWED_ORIGIN !== "*" ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  } as Record<string, string>;
}

// Preflight
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") || undefined;
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

// =========================
// ✅ System prompt (Georgian-first)
// =========================
const SYSTEM_PROMPT = `
You are Avatar G — a professional AI assistant for the AvatarG platform.
Default language: Georgian (ka). If user writes in another language, reply in that language.

Tone: confident, helpful, friendly, business-grade.
Ask 1–2 follow-up questions only when necessary.
Never hallucinate external facts. If unsure, say you are unsure.

Platform scope:
- AI Chat help, product guidance, marketing suggestions
- Music / Video / Image workflows guidance (based on the platform)
- Be practical and action-oriented.

Output rules:
- Prefer bullet points and step-by-step instructions.
- Keep answers concise unless user requests detailed.
`.trim();

// =========================
// ✅ Types + normalize
// =========================
type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };

function normalizeMessages(input: any): Msg[] {
  if (!Array.isArray(input)) return [];
  const out: Msg[] = [];

  for (const m of input) {
    if (!m || typeof m !== "object") continue;
    const role = m.role;
    const content = m.content;

    if (
      (role === "user" || role === "assistant" || role === "system") &&
      typeof content === "string" &&
      content.trim().length > 0
    ) {
      out.push({ role, content: content.trim() });
    }
  }

  // limit conversation size to avoid huge payloads
  return out.slice(-30);
}

// =========================
// ✅ POST: stream TEXT only
// =========================
export async function POST(req: Request) {
  const origin = req.headers.get("origin") || undefined;

  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response("Missing OPENAI_API_KEY", {
        status: 500,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const body = await req.json().catch(() => null);
    const messages = normalizeMessages(body?.messages);

    // Always inject system message on top
    const finalMessages: Msg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    // Create stream
    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: finalMessages,
      stream: true,
      temperature: 0.7,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (e: any) {
          // If stream breaks, return a friendly text message
          controller.enqueue(
            encoder.encode("\n\n⚠️ ბოდიში, ჩატის სტრიმინგში შეცდომა მოხდა.")
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err: any) {
    // IMPORTANT: return plain text (NOT JSON) so UI never prints JSON
    const msg =
      err?.message ||
      "Unknown error while generating response.";

    return new Response(`⚠️ Error: ${msg}`, {
      status: 500,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }
}
