// app/api/ai/route.js
import { corsPreflight, json } from "../_utils/cors";

// ✅ CORS Preflight
export async function OPTIONS(req) {
  return corsPreflight(req);
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
    const filesCount = body?.filesCount ?? 0;
    const consent = body?.consent;

    // minimal validation
    if (!details.trim() && !message.trim()) {
      return json(req, { error: "Missing 'details' or 'message'." }, 400);
    }

    // voice consent check
    if (service === "voice" && consent !== true) {
      return json(req, { error: "Consent required for voice cloning." }, 400);
    }

    // ✅ TEMP reply (შენ რომ UI-ზე ნახო მუშაობს)
    // შემდეგში აქ ჩასვამ OpenAI/LLM call-ს.
    const reply =
      `✅ Avatar G Backend OK\n` +
      `Service: ${service}\n` +
      `Lang: ${outLang}\n` +
      `Goal: ${goal || "-"}\n` +
      `Notes: ${notes || "-"}\n` +
      `FilesCount: ${filesCount}\n\n` +
      `Request:\n${(details || message).trim()}\n`;

    return json(req, { reply }, 200);
  } catch (err) {
    return json(req, { error: err?.message || "Server error" }, 500);
  }
}
