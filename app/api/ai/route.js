import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../../_utils/cors";

// POST /api/ai
// Body: { "message": "..." }
// თუ OPENAI_API_KEY არ გაქვს env-ში → აბრუნებს mock პასუხს, რომ API ცოცხალია.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = (body?.message ?? "").toString();

    // ✅ Mock რეჟიმი (თუ env-ში OPENAI_API_KEY არ არის)
    if (!process.env.OPENAI_API_KEY) {
      return withCORS(
        NextResponse.json({
          ok: true,
          mode: "mock",
          reply: message
            ? `მივიღე: "${message}". (Mock რეჟიმი — დააყენე OPENAI_API_KEY რომ რეალურად იმუშაოს)`
            : "მზად ვარ. (Mock რეჟიმი — დააყენე OPENAI_API_KEY რომ რეალურად იმუშაოს)",
        })
      );
    }

    // ✅ რეალური OpenAI call (Chat Completions)
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Avatar G AI — helpful, concise, and professional. Reply in Georgian unless user asks otherwise.",
          },
          { role: "user", content: message || "გამარჯობა" },
        ],
        temperature: 0.7,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return withCORS(
        NextResponse.json(
          {
            ok: false,
            error: data?.error?.message || "OpenAI request failed",
            details: data,
          },
          { status: resp.status }
        )
      );
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "ვერ მივიღე პასუხი მოდელიდან.";

    return withCORS(
      NextResponse.json({
        ok: true,
        mode: "openai",
        reply,
      })
    );
  } catch (err) {
    return withCORS(
      NextResponse.json(
        {
          ok: false,
          error: err?.message || "Server error",
        },
        { status: 500 }
      )
    );
  }
}

// ✅ Preflight (CORS)
export async function OPTIONS() {
  return corsOPTIONS();
}

// ✅ მარტივი GET რომ ბრაუზერში გახსნა მუშაობდეს
export async function GET() {
  return withCORS(
    NextResponse.json({
      ok: true,
      endpoint: "/api/ai",
      methods: ["GET", "POST", "OPTIONS"],
      note: "POST body: { message: string }",
    })
  );
        }
