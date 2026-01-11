import OpenAI from "openai";

export const runtime = "edge";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ✅ Avatar G System Prompt (Georgian-first)
const SYSTEM_PROMPT = `
You are Avatar G — a professional AI assistant for the AvatarG platform.
Default language: Georgian (ka). If user writes in another language, reply in that language.

Tone: confident, helpful, friendly, business-grade.
Ask 1–2 follow-up questions only when necessary.
Never hallucinate external facts. If unsure, say you are unsure.

Platform scope:
- AI Chat help, product guidance, marketing suggestions
- Music / Video / Image workflows guidance (based on the platform features)
- Be practical and action-oriented.

Output rules:
- Prefer bullet points and step-by-step instructions.
- Keep answers concise unless user requests detailed.
`.trim();

type Role = "system" | "user" | "assistant";

type Msg = {
  role: Role;
  content: string;
};

function normalizeMessages(input: any): Msg[] {
  if (!Array.isArray(input)) return [];
  const out: Msg[] = [];

  for (const m of input) {
    if (!m || typeof m !== "object") continue;
    const role = m.role;
    const content = m.content;

    if ((role === "user" || role === "assistant") && typeof content === "string") {
      out.push({ role, content });
    }
  }

  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userMessages = normalizeMessages(body?.messages);

    const messages: Msg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages,
    ];

    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      stream: true,
      temperature: 0.7,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err: any) {
    // ❗ Even on error, return readable TEXT (so UI won't show JSON)
    const msg = err?.message || "Unknown error";
    return new Response(`Error: ${msg}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
