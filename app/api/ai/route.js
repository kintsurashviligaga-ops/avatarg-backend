import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "edge";

// ===============================
// OpenAI client
// ===============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ===============================
// CORS helper (safe + production)
// ===============================
const ALLOWED_ORIGIN =
  process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "*";

function cors(origin?: string) {
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
// Preflight
// ===============================
export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: cors(req.headers.get("origin") || undefined),
  });
}

// ===============================
// POST /api/ai
// ===============================
export async function POST(req: Request) {
  const origin = req.headers.get("origin") || undefined;

  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response("OPENAI_API_KEY missing", {
        status: 500,
        headers: cors(origin),
      });
    }

    const body = await req.json().catch(() => ({}));

    const userMessage =
      typeof body?.message === "string" ? body.message.trim() : "";

    const history = Array.isArray(body?.messages)
      ? body.messages.filter(
          (m: any) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
      : [];

    if (!userMessage) {
      return new Response("Empty message", {
        status: 400,
        headers: cors(origin),
      });
    }

    const messages = [
      {
        role: "system",
        content:
          "You are Avatar G — a professional AI assistant. Default language: Georgian.",
      },
      ...history,
      { role: "user", content: userMessage },
    ];

    // 🔥 STREAM RESPONSE (plain text)
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.7,
          stream: true,
        });

        for await (const chunk of completion) {
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            await writer.write(encoder.encode(text));
          }
        }
      } catch (e: any) {
        await writer.write(
          encoder.encode("\n\n[Error] " + (e?.message || "Unknown error"))
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      status: 200,
      headers: {
        ...cors(origin),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (e: any) {
    return new Response("Server error: " + e?.message, {
      status: 500,
      headers: cors(origin),
    });
  }
}
