import OpenAI from "openai";

export const runtime = "edge";

// =========================
// ✅ OpenAI client (Edge)
// =========================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// =========================
// ✅ CORS (recommended: set strict frontend origin)
// =========================
// ✅ Vercel Env-ში რეკომენდებული:
// NEXT_PUBLIC_FRONTEND_ORIGIN = https://avatar-g.vercel.app
// თუ დატოვებ ცარიელს -> ავტომატურად იმუშავებს origin-reflect რეჟიმში (safe default)
const ALLOWED_ORIGIN = (process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "").trim();

function corsHeaders(origin?: string) {
  const reqOrigin = origin || "";
  const isStrict = ALLOWED_ORIGIN.length > 0;

  // Strict რეჟიმში მხოლოდ ALLOWED_ORIGIN
  // Non-strict რეჟიმში origin-reflect (უსაფრთხო და მუშაობს credentials-თანაც)
  const allowOrigin = isStrict ? ALLOWED_ORIGIN : reqOrigin || "*";

  // NOTE:
  // Access-Control-Allow-Credentials: true არ შეიძლება "*" origin-თან ერთად.
  // ამიტომ credentials=true მხოლოდ მაშინ ვრთავთ, როცა კონკრეტული origin გვაქვს.
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

type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };

function normalizeMessages(input: any): Msg[] {
  if (!Array.isArray(input)) return [];

  const cleaned = input
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      role: m.role as Role,
      content: String(m.content ?? ""),
    }))
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        m.content.trim().length > 0
    );

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
          if (text) await writer.write(encoder.encode(text));
        }
      } catch (e: any) {
        const msg =
          e?.message ? `\n\n[Error] ${e.message}` : "\n\n[Error] Unknown error";
        await writer.write(encoder.encode(msg));
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
