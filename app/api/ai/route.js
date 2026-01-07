// app/api/ai/route.js
import { corsPreflight, json } from "../_utils/cors";

// ✅ CORS Preflight
export async function OPTIONS(req) {
  return corsPreflight(req);
}

// ✅ GET (for quick testing in browser)
export async function GET(req) {
  return json(req, {
    status: "ok",
    route: "/api/ai",
    methods: ["POST", "OPTIONS"],
    hint: "Use POST with JSON body: { service, goal, outLang, details, notes, message, filesCount, consent }",
    time: new Date().toISOString(),
  });
}

// ✅ Main endpoint: POST /api/ai
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const service = body?.service ?? "text";
    const goal = body?.goal ?? "";
    const outLang = body?.outLang ?? "ka";
    const details = body?.details ?? "";
    const notes = body?.notes ?? "";
    const message = body?.message ?? "";
    const filesCount = Number(body?.filesCount ?? 0);
    const consent = body?.consent;

    // minimal validation
    if (!details.trim() && !message.trim()) {
      return json(req, { error: "Provide 'details' or 'message'." }, 400);
    }

    // If your UI expects "result" always:
    const resultText = [
      `✅ Avatar G AI Router (stub)`,
      `service: ${service}`,
      `goal: ${goal || "-"}`,
      `lang: ${outLang}`,
      `files: ${filesCount}`,
      `consent: ${typeof consent === "boolean" ? consent : "not_provided"}`,
      ``,
      `details: ${details}`,
      `notes: ${notes}`,
      `message: ${message}`,
    ].join("\n");

    return json(req, { ok: true, result: resultText }, 200);
  } catch (e) {
    return json(req, { error: String(e?.message || e) }, 500);
  }
}
