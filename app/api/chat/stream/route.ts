import OpenAI from "openai";

export const runtime = "edge";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const SYSTEM_PROMPT = `
You are Avatar G — a professional AI assistant for the AvatarG platform.
Default language: Georgian (ka). If user writes in another language, reply in that language.

Tone: confident, helpful, friendly, business-grade. Short and clear. 
Ask 1–2 follow-up questions only when necessary.
Never hallucinate external facts. If unsure, say you are unsure and suggest next steps.

Platform scope:
- AI Chat help, product guidance, marketing suggestions
- Music / Video / Image workflows guidance (based on the platform features)
- Be practical and action-oriented.

Output rules:
- Prefer bullet points and step-by-step instructions.
- Keep answers concise unless user requests detailed.
`;

function normalizeMessages(input: any): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    }))
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.length > 0);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userMessages = normalizeMessages(body?.messages);

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...userMessages,
    ];

    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      stream: true,
      temperature: 0.6,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) controller.enqueue(encoder.encode(content));
          }
        } catch (e) {
          controller.enqueue(encoder.encode("\n\n[stream error]\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Chat stream failed",
        message: err?.message ?? String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
