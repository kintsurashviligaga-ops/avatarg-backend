import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../_utils/cors";

const CONFIG = {
  MAX_MESSAGE_LENGTH: 6000,
  OPENAI_TIMEOUT_MS: 28000,
  DEFAULT_MODEL: "gpt-4o-mini",
};

export async function POST(req) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return withCORS(
        req,
        NextResponse.json(
          {
            ok: false,
            error: "Invalid JSON",
            code: "INVALID_JSON",
            details: "Request body must be valid JSON",
          },
          { status: 400 }
        )
      );
    }

    const message = (body?.message || "").toString().trim();
    if (!message) {
      return withCORS(
        req,
        NextResponse.json(
          {
            ok: false,
            error: "Missing message",
            code: "MISSING_MESSAGE",
            details: "Request body must include 'message' field",
          },
          { status: 400 }
        )
      );
    }

    if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
      return withCORS(
        req,
        NextResponse.json(
          {
            ok: false,
            error: "Message too long",
            code: "MESSAGE_TOO_LONG",
            details: `Maximum ${CONFIG.MAX_MESSAGE_LENGTH} characters allowed`,
          },
          { status: 400 }
        )
      );
    }

    const conversationId = body?.conversation_id || null;
    const mood = body?.mood || "auto";

    // MOCK MODE
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[AI] Running in MOCK mode - OPENAI_API_KEY not set");
      return withCORS(
        req,
        NextResponse.json({
          ok: true,
          mode: "mock",
          reply: `✅ Backend OK (MOCK mode)\n\nშენი მესიჯი მივიღე: "${message}"\n\nრეალური AI-სთვის დააყენე OPENAI_API_KEY environment variable.`,
          conversation_id: conversationId,
          mood_used: mood,
        })
      );
    }

    const model = process.env.OPENAI_MODEL || CONFIG.DEFAULT_MODEL;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONFIG.OPENAI_TIMEOUT_MS
    );

    try {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are Avatar G — a professional, helpful AI assistant for business, content creation, and automation. Reply clearly, concisely, and in the user's language (Georgian or English). Be warm but professional.",
            },
            { role: "user", content: message },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!openaiRes.ok) {
        const errorData = await openaiRes.json().catch(() => ({}));
        const errorMessage = errorData?.error?.message || `HTTP ${openaiRes.status}`;

        return withCORS(
          req,
          NextResponse.json(
            {
              ok: false,
              error: "OpenAI API error",
              code: "OPENAI_ERROR",
              status: openaiRes.status,
              details: errorMessage,
            },
            { status: 502 }
          )
        );
      }

      const data = await openaiRes.json();
      const reply =
        data?.choices?.[0]?.message?.content?.toString().trim() ||
        "No response generated.";

      return withCORS(
        req,
        NextResponse.json({
          ok: true,
          reply,
          model: data?.model || model,
          conversation_id: conversationId,
          mood_used: mood,
          usage: data?.usage || null,
        })
      );
    } catch (e) {
      clearTimeout(timeoutId);

      if (e.name === "AbortError") {
        return withCORS(
          req,
          NextResponse.json(
            {
              ok: false,
              error: "Request timeout",
              code: "TIMEOUT",
              details: `OpenAI request exceeded ${CONFIG.OPENAI_TIMEOUT_MS}ms timeout`,
            },
            { status: 504 }
          )
        );
      }

      return withCORS(
        req,
        NextResponse.json(
          {
            ok: false,
            error: "Network error",
            code: "NETWORK_ERROR",
            details: e.message || "Failed to reach OpenAI API",
          },
          { status: 502 }
        )
      );
    }
  } catch (e) {
    console.error("[AI] Unexpected error:", e);
    return withCORS(
      req,
      NextResponse.json(
        {
          ok: false,
          error: "Internal server error",
          code: "SERVER_ERROR",
          details:
            process.env.NODE_ENV === "development"
              ? e.message
              : "An unexpected error occurred",
        },
        { status: 500 }
      )
    );
  }
}

export async function OPTIONS(req) {
  return corsOPTIONS(req);
                }
