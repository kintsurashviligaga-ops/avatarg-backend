// app/api/ai/route.js
import { cors } from "../_utils/cors";

// ✅ Always handle preflight
export async function OPTIONS(req) {
  return new Response(null, { status: 204, headers: cors(req) });
}

// ✅ Allow GET for testing (prevents 405 in browser / Test Backend)
export async function GET(req) {
  const headers = cors(req);
  return new Response(
    JSON.stringify({
      ok: true,
      route: "/api/ai",
      method: "GET",
      message: "AI endpoint is alive. Use POST to send prompts."
    }),
    { status: 200, headers }
  );
}

// ✅ Main AI handler (POST)
export async function POST(req) {
  const headers = cors(req);

  try {
    // Accept JSON body
    const body = await req.json().catch(() => ({}));
    const prompt =
      body.prompt ??
      body.message ??
      body.input ??
      "";

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing prompt",
          hint: "Send JSON: { \"prompt\": \"hello\" }"
        }),
        { status: 400, headers }
      );
    }

    // ✅ Temporary dummy AI response (stable & safe)
    // Later we will replace this block with OpenAI call
    const reply = `✅ Received: ${prompt}\n\n(Backend OK. Next step: connect OpenAI + Supabase logging.)`;

    return new Response(
      JSON.stringify({
        ok: true,
        reply,
        prompt,
        ts: new Date().toISOString()
      }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Server error",
        details: String(err?.message || err)
      }),
      { status: 500, headers }
    );
  }
}
