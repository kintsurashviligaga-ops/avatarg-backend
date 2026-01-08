// app/api/ai/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ==================== CONFIGURATION ====================

const CONFIG = {
  MAX_MESSAGE_LENGTH: 6000,
  OPENAI_TIMEOUT_MS: 28000,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 20,
  DEBUG: process.env.DEBUG === "true",
};

// ==================== CORS ====================

function getAllowedOrigins() {
  const env = process.env.FRONTEND_ORIGINS || "";
  const list = env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const defaults = [
    "https://avatar-g.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
  ];

  const normalize = (u) => u.replace(/\/+$/, "");
  const merged = [...list, ...defaults].map(normalize);

  return Array.from(new Set(merged));
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  const normalized = origin.replace(/\/+$/, "");
  return allowed.includes(normalized);
}

function corsHeaders(req, allowOrigin = true) {
  const origin = req.headers.get("origin") || "";

  // Always include content-type for consistency
  const base = {
    "Content-Type": "application/json",
  };

  if (!allowOrigin || !origin || !isOriginAllowed(origin)) {
    return base;
  }

  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ==================== RATE LIMITING ====================
// NOTE: Best-effort only on Serverless. For strict RL use Redis/Upstash.

const rateLimitStore = new Map();

function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(key);
    }
  }
}

function checkRateLimit(identifier) {
  cleanupRateLimit();

  const now = Date.now();
  const key = `ip:${identifier}`;

  let record = rateLimitStore.get(key);

  if (!record || now - record.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
    record = { windowStart: now, count: 0 };
    rateLimitStore.set(key, record);
  }

  record.count++;

  if (record.count > CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    const resetIn = Math.ceil(
      (CONFIG.RATE_LIMIT_WINDOW_MS - (now - record.windowStart)) / 1000
    );
    return { allowed: false, resetIn, limit: CONFIG.RATE_LIMIT_MAX_REQUESTS };
  }

  return {
    allowed: true,
    remaining: CONFIG.RATE_LIMIT_MAX_REQUESTS - record.count,
    limit: CONFIG.RATE_LIMIT_MAX_REQUESTS,
  };
}

function getClientIdentifier(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// ==================== UTILITIES ====================

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sanitizeInput(input) {
  if (typeof input !== "string") return "";

  // Keep newlines & formatting; only remove null bytes and trim.
  let cleaned = input.replace(/\0/g, "").trim();

  if (cleaned.length > CONFIG.MAX_MESSAGE_LENGTH) {
    cleaned = cleaned.substring(0, CONFIG.MAX_MESSAGE_LENGTH);
  }

  return cleaned;
}

function normalizeMessages(body) {
  const singleMsg = body?.message || body?.prompt || body?.text || "";

  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages
      .map((m) => ({
        role:
          m?.role === "assistant" || m?.role === "system" ? m.role : "user",
        content: sanitizeInput(String(m?.content ?? "")),
      }))
      .filter((m) => m.content);
  }

  if (singleMsg) {
    return [{ role: "user", content: sanitizeInput(String(singleMsg)) }];
  }

  return [];
}

function buildSystemPrompt() {
  return (
    "You are Avatar G — a professional AI assistant for the Avatar G Workspace. " +
    "You provide clear, helpful, and actionable responses. " +
    "If the user writes in Georgian (ქართული), respond in Georgian. " +
    "Keep answers concise and professional."
  );
}

function debugLog(...args) {
  if (CONFIG.DEBUG) console.log("[AI Route]", ...args);
}

// ==================== OPENAI INTEGRATION ====================

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      error: "Configuration Error",
      hint:
        "OPENAI_API_KEY is missing. Add it to Vercel environment variables and redeploy.",
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const payload = {
    model,
    messages: [{ role: "system", content: buildSystemPrompt() }, ...messages],
    temperature: 0.7,
    max_tokens: 2000,
  };

  debugLog("OpenAI Request:", { model, messageCount: messages.length });

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONFIG.OPENAI_TIMEOUT_MS
  );

  const startTime = Date.now();

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

    const elapsed = Date.now() - startTime;
    debugLog("OpenAI Response:", { status: res.status, elapsed: `${elapsed}ms` });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg =
        data?.error?.message || data?.message || `OpenAI API error: HTTP ${res.status}`;

      return {
        ok: false,
        error: errorMsg,
        statusCode: res.status,
        hint:
          res.status === 401
            ? "Invalid OPENAI_API_KEY. Check your API key in Vercel environment variables."
            : res.status === 429
            ? "OpenAI rate limit exceeded. Wait and retry or upgrade your plan."
            : "OpenAI API request failed. Check logs for details.",
      };
    }

    const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";

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
        hint: `OpenAI request exceeded ${CONFIG.OPENAI_TIMEOUT_MS / 1000}s timeout. Try again.`,
      };
    }

    return {
      ok: false,
      error: "Network Error",
      hint: "Failed to connect to OpenAI API. Check network connectivity and API status.",
    };
  }
}

// ==================== ROUTE HANDLERS ====================

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
      note: "Use POST with JSON: { message: 'Your question' } or { messages: [...] }",
      version: "2.0.1",
    },
    { headers: corsHeaders(req, true) }
  );
}

export async function POST(req) {
  const startTime = Date.now();
  const origin = req.headers.get("origin") || "";

  // 1) CORS
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
  const rateLimit = checkRateLimit(clientId);

  if (!rateLimit.allowed) {
    debugLog("Rate Limit Exceeded:", clientId);
    return NextResponse.json(
      {
        error: "Rate Limit Exceeded",
        hint: `Maximum ${rateLimit.limit} requests per minute. Try again in ${rateLimit.resetIn} seconds.`,
        retryAfter: rateLimit.resetIn,
      },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(rateLimit.resetIn) },
      }
    );
  }

  try {
    // 3) Parse body
    const rawText = await req.text().catch(() => "");
    const body = safeJsonParse(rawText);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON", hint: "Send { message: 'Your text' }" },
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

    // 5) Call OpenAI
    const ai = await callOpenAI(messages);

    if (!ai.ok) {
      return NextResponse.json(
        { error: ai.error || "AI Request Failed", hint: ai.hint || "Unknown error.", statusCode: ai.statusCode },
        { status: ai.statusCode || 500, headers }
      );
    }

    const elapsed = Date.now() - startTime;

    // 6) Success
    return NextResponse.json(
      {
        reply: ai.text,
        meta: {
          model: ai.model,
          processingTime: `${elapsed}ms`,
          ...(CONFIG.DEBUG && ai.usage ? { usage: ai.usage } : {}),
        },
      },
      { status: 200, headers }
    );
  } catch (e) {
    const errorMessage = CONFIG.DEBUG ? e?.message || "Unknown error" : "Internal Server Error";
    return NextResponse.json(
      { error: errorMessage, hint: "Unexpected error occurred. Try again." },
      { status: 500, headers }
    );
  }
}
