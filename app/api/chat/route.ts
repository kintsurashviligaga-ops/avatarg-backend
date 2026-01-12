import { NextResponse } from "next/server";
import { corsOPTIONS, withCORS } from "@/app/api/utils/cors";

export const runtime = "nodejs";

/**
 * POST /api/chat
 * Body:
 * {
 *   "message": "hello",
 *   "messages": [{role:"user"|"assistant", content:"..."}],
 *   "client": "...",
 *   "user": "email or null"
 * }
 *
 * Returns:
 * { ok: true, text: "clean assistant text" }
 */

function pickTextFromOpenAI(data: any): string {
  if (!data) return "";

  // New Responses API shapes
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        const t = item.content.find((c: any) => c?.type === "output_text" && c?.text);
        if (t?.text) return String(t.text).trim();
        const t2 = item.content.find((c: any) => c?.text);
        if (t2?.text) return String(t2.text).trim();
      }
    }
  }

  // Chat Completions shape
  const cc = data?.choices?.[0]?.message?.content;
  if (typeof cc === "string" && cc.trim()) return cc.trim();

  // Sometimes plain text
  if (typeof data?.text === "string" && data.text.trim()) return data.text.trim();

  // Fallback JSON string (but we try to avoid this)
  try {
    return JSON.stringify(data, null, 2).slice(0, 4000);
  } catch {
    return String(data ?? "");
  }
}

function normalizeHistory(messages: any): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((m) => ({
      role: m?.role,
      content: typeof m?.content === "string" ? m.content : "",
    }))
    .filter((m) => (m.role === "user" || m.role === "assistant" || m.role === "system") && m.content.trim())
    .slice(-12);
}

export async function OPTIONS(req: Request) {
  return corsOPTIONS(req);
}

export async function POST(req: Request) {
  const resHeaders = new Headers();
  // We'll attach CORS at the end with withCORS()

  try {
    const body = await req.json().catch(() => ({}));

    const message = String(body?.message ?? "").trim();
    const history = normalizeHistory(body?.messages);

    if (!message || message.length < 1) {
      return withCORS(
        req,
        NextResponse.json({ ok: false, error: "message_required" }, { status: 400, headers: resHeaders })
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return withCORS(
        req,
        NextResponse.json({ ok: false, error: "missing_openai_key" }, { status: 500, headers: resHeaders })
      );
    }

    // Simple system instruction for clean output
    const sys = {
      role: "system" as const,
      content:
        "You are Avatar G assistant. Reply clearly and helpfully. Output ONLY plain text. No JSON. No markdown fences unless user asks.",
    };

    const messages = [sys, ...history, { role: "user" as const, content: message }];

    // Use OpenAI via HTTP (no SDK needed)
    // We'll try Chat Completions endpoint format for compatibility
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        messages,
        temperature: 0.6,
      }),
    });

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      const errMsg =
        data?.error?.message ||
        data?.error ||
        data?.message ||
        `OpenAI HTTP ${r.status}`;
      return withCORS(
        req,
        NextResponse.json(
          { ok: false, error: "openai_error", details: String(errMsg).slice(0, 800) },
          { status: 502, headers: resHeaders }
        )
      );
    }

    const text = pickTextFromOpenAI(data);
    return withCORS(req, NextResponse.json({ ok: true, text }, { status: 200, headers: resHeaders }));
  } catch (e: any) {
    return withCORS(
      req,
      NextResponse.json(
        { ok: false, error: "server_error", details: String(e?.message ?? e).slice(0, 800) },
        { status: 500, headers: resHeaders }
      )
    );
  }
}
