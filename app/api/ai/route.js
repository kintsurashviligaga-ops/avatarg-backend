import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../utils/cors";

const CONFIG = {
  MAX_MESSAGE_LENGTH: 6000,
  OPENAI_TIMEOUT_MS: 28000,
  DEFAULT_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
};

// OPTIONS — CORS preflight
export async function OPTIONS(req) {
  return corsOPTIONS(req);
}

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

export async function POST(req) {
  try {
    let body;

    try {
      body = await req.json();
    } catch {
      return jsonError(
        req,
        400,
        "INVALID_JSON",
        "Request body must be valid JSON"
      );
    }

    const { messages, model } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonError(
        req,
        400,
        "INVALID_MESSAGES",
        "`messages` must be a non-empty array"
      );
    }

    const userMessage = messages[messages.length - 1]?.content || "";

    if (userMessage.length > CONFIG.MAX_MESSAGE_LENGTH) {
      return jsonError(
        req,
        413,
        "MESSAGE_TOO_LARGE",
        "Message is too long",
        { max: CONFIG.MAX_MESSAGE_LENGTH }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return jsonError(
        req,
        500,
        "OPENAI_KEY_MISSING",
        "OPENAI_API_KEY is not set"
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONFIG.OPENAI_TIMEOUT_MS
    );

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || CONFIG.DEFAULT_MODEL,
        messages,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const err = await response.text();
      return jsonError(
        req,
        response.status,
        "OPENAI_ERROR",
        "OpenAI API error",
        { details: err }
      );
    }

    const data = await response.json();

    return withCORS(
      req,
      NextResponse.json({
        ok: true,
        result: data,
      })
    );
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    return jsonError(
      req,
      isAbort ? 504 : 500,
      isAbort ? "TIMEOUT" : "INTERNAL_ERROR",
      isAbort ? "OpenAI request timed out" : "Internal server error"
    );
  }
}
