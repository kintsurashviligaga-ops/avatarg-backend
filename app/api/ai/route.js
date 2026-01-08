import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../../utils/cors";

const CONFIG = {
  MAX_MESSAGE_LENGTH: 6000,
  OPENAI_TIMEOUT_MS: 28000,
  DEFAULT_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
};

function jsonError(req, status, code, message, extra = {}) {
  return withCORS(
    req,
    NextResponse.json(
      {
        ok: false,
        error: message,
        code,
        ...extra,
      },
      { status }
    )
  );
}

export async function OPTIONS(req) {
  return corsOPTIONS(req);
}

export async function POST(req) {
  try {
    // 1) Parse JSON body safely
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(req, 400, "INVALID_JSON", "Request body must be valid JSON", {
        details: "Expected JSON body",
      });
    }

    // 2) Validate input
    const message =
      typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return jsonError(req, 400, "MISSING_MESSAGE", "Field `message` is required");
    }

    if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
      return jsonError(
        req,
        413,
        "MESSAGE_TOO_LONG",
        `Message too long. Max is ${CONFIG.MAX_MESSAGE_LENGTH} characters.`,
        { max: CONFIG.MAX_MESSAGE_LENGTH, got: message.length }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonError(
        req,
        500,
        "OPENAI_KEY_MISSING",
        "Server is missing OPENAI_API_KEY environment variable"
      );
    }

    // 3) Call OpenAI (chat/completions compatible)
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONFIG.OPENAI_TIMEOUT_MS
    );

    let upstream;
    try {
      upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: CONFIG.DEFAULT_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are Avatar G — a helpful, professional assistant for the Avatar G Workspace. Reply clearly and concisely.",
            },
            { role: "user", content: message },
          ],
          temperature: 0.4,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      const isAbort =
        e?.name === "AbortError" ||
        String(e?.message || "").toLowerCase().includes("aborted");

      return jsonError(
        req,
        isAbort ? 504 : 502,
        isAbort ? "OPENAI_TIMEOUT" : "OPENAI_FETCH_FAILED",
        isAbort
          ? "OpenAI request timed out"
          : "Failed to reach OpenAI API",
        { details: String(e?.message || e) }
      );
    } finally {
      clearTimeout(timeout);
    }

    // 4) Handle upstream errors
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (!upstream.ok) {
      return jsonError(
        req,
        upstream.status || 502,
        "OPENAI_ERROR",
        "OpenAI API returned an error",
        {
          status: upstream.status,
          details: data || text,
        }
      );
    }

    const reply =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "";

    return withCORS(
      req,
      NextResponse.json({
        ok: true,
        model: CONFIG.DEFAULT_MODEL,
        reply,
        usage: data?.usage || null,
      })
    );
  } catch (e) {
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected server error", {
      details: String(e?.message || e),
    });
  }
}
