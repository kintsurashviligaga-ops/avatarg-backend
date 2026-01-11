import OpenAI from "openai";

export const runtime = "edge";

type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };

// =========================
// ✅ OpenAI client (Edge)
// =========================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// =========================
// ✅ CORS (recommended: strict frontend origin)
// =========================
// Vercel Env რეკომენდაცია:
// NEXT_PUBLIC_FRONTEND_ORIGIN = https://avatar-g.vercel.app
// თუ ცარიელია -> origin-reflect რეჟიმი (safe default)
const ALLOWED_ORIGIN = (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "").trim();

function corsHeaders(origin?: string) {
  const reqOrigin = (origin || "").trim();
  const strict = ALLOWED_ORIGIN.length > 0;

  // strict => მხოლოდ შენი origin
  // non-strict => reflect origin (credentials-friendly)
  const allowOrigin = strict ? ALLOWED_ORIGIN : reqOrigin || "*";

  // credentials=true არ შეიძლება "*" origin-თან ერთად
  const allowCreds = allowOrigin !== "*" ? "true" : "false";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": allowCreds,
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

Default language: Georgian (ka). If user writes in another language, respond in that language.

Tone: confident, helpful, friendly, business-grade.
Be concise and clear.
Ask 1-2 follow-up questions only when necessary.
Never hallucinate external facts. If unsure, say you are unsure.

Platform scope:
- AI Chat help, product guidance, marketing suggestions
- Music / Video / Image workflows guidance
- Be practical and action-oriented

Output rules:
- Prefer bullet points and step-by-step instructions
- Keep answers concise unless user requests detailed
`.trim();

function normalizeMessages(input: any): Msg[] {
  if (!Array.isArray(input)) return [];

  const cleaned: Msg[] = input
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      role: String(m.role) as Role,
      content: String(m.content ?? ""),
    }))
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        m.content.trim().length > 0
    );

  // limit history
  const MAX_HISTORY = 30;
  return cleaned.slice(-MAX_HISTORY);
}

// =========================
// ✅ POST: stream plain text (NOT JSON)
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

    const body = await req.json().catch(() => ({}));
    const messages = normalizeMessages(body?.messages);

    if (!messages.length) {
      return new Response("Missing messages[]", {
        status: 400,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const finalMessages: Msg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const encoder = new TextEncoder();
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    // async producer
    (async () => {
      try {
        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: finalMessages,
          stream: true,
          temperature: 0.7,
        });

        for await (const chunk of completion) {
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            await writer.write(encoder.encode(text));
          }
        }
      } catch (e: any) {
        const msg =
          e?.message ? `\n\n[Error] ${e.message}` : "\n\n[Error] Unknown error";
        try {
          await writer.write(encoder.encode(msg));
        } catch {}
      } finally {
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(stream.readable, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err: any) {
    return new Response(err?.message ? `Error: ${err.message}` : "Unknown error", {
      status: 500,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
