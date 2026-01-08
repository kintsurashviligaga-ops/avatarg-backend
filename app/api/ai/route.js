// app/api/ai/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ==================== CONFIG ====================

const CONFIG = {
  MAX_MESSAGE_LENGTH: 6000,
  OPENAI_TIMEOUT_MS: 28000,
  RATE_LIMIT_WINDOW_MS: 60000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 20, // per IP
  DEBUG: process.env.DEBUG === "true",
};

// ==================== CORS (STRICT ALLOWLIST) ====================

function normalizeUrl(u) {
  return String(u || "").trim().replace(/\/+$/, "");
}

function getAllowedOrigins() {
  const env = process.env.FRONTEND_ORIGINS || "";
  const list = env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeUrl);

  const defaults = [
    "https://avatar-g.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
  ].map(normalizeUrl);

  return Array.from(new Set([...list, ...defaults]));
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  return allowed.includes(normalizeUrl(origin));
}

function corsHeaders(req, allowOrigin = true) {
  const origin = req.headers.get("origin") || "";

  // If no origin (server-to-server / curl), just return JSON header.
  if (!origin) {
    return { "Content-Type": "application/json" };
  }

  // If origin present, enforce allowlist.
  if (!allowOrigin || !isOriginAllowed(origin)) {
    return { "Content-Type": "application/json" };
  }

  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ==================== RATE LIMIT (IN-MEMORY) ====================

const rateLimitStore = new Map();

function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, rec] of rateLimitStore.entries()) {
    if (now - rec.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(key);
    }
  }
}

function getClientIdentifier(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function checkRateLimit(identifier) {
  cleanupRateLimit();
  const now = Date.now();
  const key = `ip:${identifier}`;

  let rec = rateLimitStore.get(key);
  if (!rec || now - rec.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
    rec = { windowStart: now, count: 0 };
    rateLimitStore.set(key, rec);
  }

  rec.count += 1;

  if (rec.count > CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    const resetIn = Math.ceil(
      (CONFIG.RATE_LIMIT_WINDOW_MS - (now - rec.windowStart)) / 1000
    );
    return { allowed: false, resetIn, limit: CONFIG.RATE_LIMIT_MAX_REQUESTS };
  }

  return {
    allowed: true,
    remaining: CONFIG.RATE_LIMIT_MAX_REQUESTS - rec.count,
    limit: CONFIG.RATE_LIMIT_MAX_REQUESTS,
  };
}

// ==================== UTILITIES ====================

function debugLog(...args) {
  if (CONFIG.DEBUG) console.log("[AI Route]", ...args);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sanitizeInput(input) {
  if (typeof input !== "string") return "";
  let cleaned = input.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length > CONFIG.MAX_MESSAGE_LENGTH) {
    cleaned = cleaned.slice(0, CONFIG.MAX_MESSAGE_LENGTH);
  }
  return cleaned;
}

function normalizeMessages(body) {
  const single =
    body?.message ||
    body?.prompt ||
    body?.text ||
    "";

  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages
      .map((m) => ({
        role: (m?.role === "assistant" || m?.role === "system") ? m.role : "user",
        content: sanitizeInput(String(m?.content ?? "")),
      }))
      .filter((m) => m.content);
  }

  if (single) {
    return [{ role: "user", content: sanitizeInput(String(single)) }];
  }

  return [];
}

// ==================== LANGUAGE CONTROL (FIX) ====================

// Detect Georgian vs English vs Russian based on last user message.
function detectLangFromText(text) {
  const t = String(text || "");
  const hasKa = /[\u10A0-\u10FF]/.test(t); // Georgian
  const hasRu = /[\u0400-\u04FF]/.test(t); // Cyrillic
  const hasEn = /[A-Za-z]/.test(t);

  if (hasKa) return "ka";
  if (hasRu) return "ru";
  if (hasEn) return "en";
  return "ka"; // default to Georgian
}

function getLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && messages[i]?.content) {
      return messages[i].content;
    }
  }
  return "";
}

// Hard guard: if user is Georgian, forbid Cyrillic/Latin in final text.
function violatesLangPolicy(text, lang) {
  const s = String(text || "");
  if (lang === "ka") {
    // Allow digits/punctuation/emoji, but forbid Cyrillic + Latin letters.
    if (/[\u0400-\u04FF]/.test(s)) return true; // Cyrillic
    if (/[A-Za-z]/.test(s)) return true; // Latin
  }
  if (lang === "ru") {
    // For RU forbid Georgian letters (optional strictness).
    if (/[\u10A0-\u10FF]/.test(s)) return true;
  }
  // For EN we keep loose (it can contain names etc.)
  return false;
}

function buildSystemPrompt(lang) {
  if (lang === "ka") {
    return (
      "You are Avatar G — a professional AI assistant for the Avatar G Workspace. " +
      "IMPORTANT: Respond ONLY in Georgian (ქართული). Do NOT use Russian or English. " +
      "Keep answers concise, helpful, and professional. " +
      "If you must use a brand name or URL, keep it minimal."
    );
  }
  if (lang === "ru") {
    return (
      "You are Avatar G — a professional AI assistant for the Avatar G Workspace. " +
      "Respond ONLY in Russian. Keep answers concise and professional."
    );
  }
  return (
    "You are Avatar G — a professional AI assistant for the Avatar G Workspace. " +
    "Respond ONLY in English. Keep answers concise and professional."
  );
}

// ==================== OPENAI CALL ====================

async function callOpenAI(messages, lang) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      error: "Configuration Error",
      hint: "OPENAI_API_KEY is missing. Add it to Vercel environment variables and redeploy.",
      statusCode: 500,
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const payload = {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(lang) },
      ...messages,
    ],
    temperature: 0.7,
    max_tokens: 2000,
  };

  debugLog("OpenAI Request:", { model, lang, messageCount: messages.length });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.OPENAI_TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const elapsed = Date.now() - start;
    debugLog("OpenAI Response:", { status: res.status, elapsed: `${elapsed}ms` });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `OpenAI API error: HTTP ${res.status}`;

      return {
        ok: false,
        error: msg,
        statusCode: res.status,
        hint:
          res.status === 401
            ? "Invalid OPENAI_API_KEY. Check your API key in Vercel environment variables."
            : res.status === 429
            ? "OpenAI rate limit exceeded. Wait and retry or upgrade your plan."
            : "OpenAI API request failed. Check logs for details.",
      };
    }

    const text =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "";

    return {
      ok: true,
      text: text || "(empty response)",
      model: data?.model,
      usage: data?.usage,
    };
  } catch (e) {
    clearTimeout(timeoutId);

    if (e?.name === "AbortError") {
      return {
        ok: false,
        error: "Request Timeout",
        statusCode: 504,
        hint: `OpenAI request exceeded ${CONFIG.OPENAI_TIMEOUT_MS / 1000}s timeout. Try shorter message or retry.`,
      };
    }

    return {
      ok: false,
      error: "Network Error",
      statusCode: 502,
      hint: "Failed to connect to OpenAI API. Check network and API status.",
    };
  }
}

// Second pass fix if language got mixed.
async function enforceLanguageIfNeeded(originalText, messages, lang) {
  if (!violatesLangPolicy(originalText, lang)) return originalText;

  const fixerSystem =
    lang === "ka"
      ? "Rewrite the following text into PURE Georgian only. Remove any Russian/English words completely. Keep meaning. Output only Georgian."
      : lang === "ru"
      ? "Rewrite the following text into PURE Russian only. Remove any Georgian/English words completely. Keep meaning. Output only Russian."
      : "Rewrite the following text into PURE English only. Remove any Georgian/Russian words completely. Keep meaning. Output only English.";

  const fixMessages = [
    { role: "system", content: fixerSystem },
    { role: "user", content: originalText },
  ];

  const fixed = await callOpenAI(fixMessages, lang);
  if (fixed.ok && fixed.text && !violatesLangPolicy(fixed.text, lang)) {
    return fixed.text;
  }

  // Fallback: if still bad, return a safe short message.
  if (lang === "ka") {
    return "ბოდიში, მოხდა ტექნიკური ხარვეზი. გთხოვ, თავიდან მომწერე და მხოლოდ ქართულად გიპასუხებ.";
  }
  if (lang === "ru") {
    return "Извините, произошла техническая ошибка. Напишите ещё раз — отвечу только по-русски.";
  }
  return "Sorry, a technical issue occurred. Please try again — I will reply only in English.";
}

// ==================== HANDLERS ====================

export async function OPTIONS(req) {
  const origin = req.headers.get("origin") || "";

  if (origin && !isOriginAllowed(origin)) {
    debugLog("CORS Preflight Rejected:", origin);
    return new NextResponse(null, {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req, true),
  });
}

export async function GET(req) {
  return NextResponse.json(
    {
      status: "ok",
      service: "Avatar G AI Endpoint",
      note: "Use POST with JSON: { message: '...' } or { messages: [...] }",
      version: "2.1.0",
    },
    { headers: corsHeaders(req, true) }
  );
}

export async function POST(req) {
  const startTime = Date.now();
  const origin = req.headers.get("origin") || "";

  // 1) CORS check
  if (origin && !isOriginAllowed(origin)) {
    debugLog("CORS Rejected:", origin);
    return NextResponse.json(
      {
        error: "Origin Not Allowed",
        hint: "Your domain is not in the FRONTEND_ORIGINS allowlist.",
      },
      { status: 403, headers: corsHeaders(req, false) }
    );
  }

  const headers = corsHeaders(req, true);

  // 2) Rate limit
  const clientId = getClientIdentifier(req);
  const rl = checkRateLimit(clientId);
  if (!rl.allowed) {
    debugLog("Rate Limit Exceeded:", clientId);
    return NextResponse.json(
      {
        error: "Rate Limit Exceeded",
        hint: `Max ${rl.limit} requests/min. Try again in ${rl.resetIn}s.`,
        retryAfter: rl.resetIn,
      },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(rl.resetIn) },
      }
    );
  }

  try {
    // 3) Parse body
    const rawText = await req.text().catch(() => "");
    const body = safeJsonParse(rawText);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON", hint: "Send JSON like { message: '...' }" },
        { status: 400, headers }
      );
    }

    // 4) Normalize messages
    const messages = normalizeMessages(body);

    if (!messages.length) {
      return NextResponse.json(
        {
          error: "No Message Found",
          hint: "Send { message: '...' } or { messages: [{role:'user', content:'...'}] }",
          receivedKeys: Object.keys(body),
        },
        { status: 400, headers }
      );
    }

    // 5) Detect language from last user input
    const lastUser = getLastUserMessage(messages) || "";
    const lang = detectLangFromText(lastUser);

    // 6) Call OpenAI
    const ai = await callOpenAI(messages, lang);

    if (!ai.ok) {
      return NextResponse.json(
        {
          error: ai.error || "AI Request Failed",
          hint: ai.hint || "Unknown error occurred.",
          statusCode: ai.statusCode,
        },
        { status: ai.statusCode || 500, headers }
      );
    }

    // 7) Enforce language strictly (fix mixed output)
    const finalText = await enforceLanguageIfNeeded(ai.text, messages, lang);

    const elapsed = Date.now() - startTime;

    return NextResponse.json(
      {
        reply: finalText,
        meta: {
          model: ai.model,
          lang,
          processingTime: `${elapsed}ms`,
          ...(CONFIG.DEBUG && ai.usage ? { usage: ai.usage } : {}),
        },
      },
      { status: 200, headers }
    );
  } catch (e) {
    const elapsed = Date.now() - startTime;
    debugLog("Server Error:", e?.message, { elapsed: `${elapsed}ms` });

    const errorMessage = CONFIG.DEBUG
      ? e?.message || "Unknown error"
      : "Internal Server Error";

    return NextResponse.json(
      { error: errorMessage, hint: "Unexpected error. Please retry." },
      { status: 500, headers }
    );
  }
}
