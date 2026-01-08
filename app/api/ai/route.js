import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../_utils/cors";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = (body?.message || "").toString().trim();
    const model = (body?.model || "gpt-4o-mini").toString();

    if (!message) {
      return withCORS(
        req,
        NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 })
      );
    }

    // ✅ MOCK mode (no key) — always returns stable response
    if (!process.env.OPENAI_API_KEY) {
      return withCORS(
        req,
        NextResponse.json({
          ok: true,
          mode: "mock",
          reply: `✅ Avatar G (mock) received: "${message}"`,
        })
      );
    }

    // ✅ REAL OpenAI mode
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content:
              "You are Avatar G — a professional, helpful AI assistant for business and content automation. Keep answers clear and actionable.",
          },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return withCORS(
        req,
        NextResponse.json(
          { ok: false, error: "OpenAI request failed", details: errText.slice(0, 800) },
          { status: 500 }
        )
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "";

    return withCORS(
      req,
      NextResponse.json({
        ok: true,
        mode: "openai",
        reply,
      })
    );
  } catch (e) {
    return withCORS(
      req,
      NextResponse.json(
        { ok: false, error: "Server error", details: String(e?.message || e) },
        { status: 500 }
      )
    );
  }
}

export async function OPTIONS(req) {
  return corsOPTIONS(req);
}
