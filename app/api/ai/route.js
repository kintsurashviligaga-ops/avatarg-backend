// app/api/ai/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ==================== CONFIG ====================

const CONFIG = {
  MAX_MESSAGE_LENGTH: 6000,
  OPENAI_TIMEOUT_MS: 28000,
  RATE_LIMIT_WINDOW_MS: 60_000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 20,  // 20 req/min per IP
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
    .map((s) => normalizeUrl(s))
    .filter(Boolean);

  // safe defaults (შეგიძლია FRONTEND_ORIGINS-ით ჩაანაცვლო)
  const defaults = [
    "https://avatar-g.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
  ].map(normalizeUrl);

  return Array.from(new Set([...defaults, ...list]));
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  const o = normalizeUrl(origin);
  return getAllowedOrigins().includes(o);
}

function corsHeaders(req, allow = true) {
  const origin = req.headers.get("origin") || "";
  if (!allow || !origin || !isOriginAllowed(origin)) {
    // no CORS headers when blocked (safer)
    return { "Content-Type": "application/json" };
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

// ==================== RATE LIMIT (IN-MEMORY) ====================
// Note: Serverless-ზე შეიძლება reset-დებოდეს deploy/instance-ზე — მაგრამ პრაქტიკულად მუშაობს.

const rateLimitStore = new Map();

function cleanupRateLimit() {
  const now = Date.now();
  for (const [k, v] of rateLimitStore.entries()) {
    if (now - v.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(k);
    }
  }
}

function getClientIdentifier(req) {
  // Vercel: x-forwarded-for ხშირად ყველაზე სწორი
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function checkRateLimit(id) {
  cleanupRateLimit();
  const now = Date.now();
  const key = `ip:${id}`;

  let rec = rateLimitStore.get(key);
  if (!rec || now - rec.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
    rec = { windowStart: now, count: 0 };
    rateLimitStore.set(key, rec);
  }

  rec.count += 1;

  const remaining = Math.max(0, CONFIG.RATE_LIMIT_MAX_REQUESTS - rec.count);
  if (rec.count > CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    const resetInMs = CONFIG.RATE_LIMIT_WINDOW_MS - (now - rec.windowStart);
    const resetIn = Math.max(1, Math.ceil(resetInMs / 1000));
    return { allowed: false, remaining: 0, resetIn, limit: CONFIG.RATE_LIMIT_MAX_REQUESTS };
  }

  const resetInMs = CONFIG.RATE_LIMIT_WINDOW_MS - (now - rec.windowStart);
  const resetIn = Math.max(1, Math.ceil(resetInMs / 1000));
  return { allowed: true, remaining, resetIn, limit: CONFIG.RATE_LIMIT_MAX_REQUESTS };
}

// ==================== HELPERS ====================

function debugLog(...args) {
  if (CONFIG.DEBUG) console.log("[/api/ai]", ...args);
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
  let s = input.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  if (s.length > CONFIG.MAX_MESSAGE_LENGTH) s = s.slice(0, CONFIG.MAX_MESSAGE_LENGTH);
  return s;
}

function normalizeMessages(body) {
  // Priority: messages[] if exists, else message/prompt/text
  const rawMessages = Array.isArray(body?.messages) ? body.messages : null;

  if (rawMessages && rawMessages.length) {
    const cleaned = rawMessages
      .map((m) => {
        const role = m?.role;
        const allowedRole =
          role === "system" || role === "assistant" || role === "user" ? role : "user";
        return {
          role: allowedRole,
          content: sanitizeInput(String(m?.content ?? "")),
        };
      })
      .filter((m) => m.content);

    // თუ frontend-მა message-საც გამოგზავნა, ნუ დავადუბლირებთ:
    return cleaned;
  }

  const single =
    body?.message ||
    body?.prompt ||
    body?.text ||
    "";

  const msg = sanitizeInput(String(single));
  if (msg) return [{ role: "user", content: msg }];
  return [];
}

function buildSystemPrompt() {
  return (
    "You are Avatar G — a professional AI assistant for the Avatar G Workspace. " +
    "Provide clear, helpful, actionable responses. " +
    "If the user writes in Georgian (ქართული), respond in Georgian. " +
    "Keep answers concise and professional."
  );
}

// ==================== OPENAI (Chat Completions) ====================

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      statusCode: 500,
      error: "Configuration Error",
      hint: "OPENAI_API_KEY is missing in Vercel environment variables. Add it and redeploy.",
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const payload = {
    model,
    messages: [{ role: "system", content: buildSystemPrompt() }, ...messages],
    temperature: 0.7,
    max_tokens: 2000,
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), CONFIG.OPENAI_TIMEOUT_MS);

  try {
    debugLog("OpenAI request:", { model, count: messages.length });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `OpenAI API error: HTTP ${res.status}`;

      return {
        ok: false,
        statusCode: res.status,
        error: msg,
        hint:
          res.status === 401
            ? "Invalid OPENAI_API_KEY. Check Vercel env and redeploy."
            : res.status === 429
            ? "OpenAI rate limit exceeded. Wait or upgrade plan."
            : "OpenAI request failed. Check Vercel logs for details.",
      };
    }

    const text = data?.choices?.[0]?.message?.content || "";
    return {
      ok: true,
      text: text || "(empty response)",
      model: data?.model || model,
      usage: data?.usage,
    };
  } catch (e) {
    if (e?.name === "AbortError") {
      return {
        ok: false,
        statusCode: 504,
        error: "Request Timeout",
        hint: `OpenAI request exceeded ${Math.round(CONFIG.OPENAI_TIMEOUT_MS / 1000)}s. Try shorter input.`,
      };
    }
    return {
      ok: false,
      statusCode: 502,
      error: "Network Error",
      hint: "Failed to connect to OpenAI API. Check network / OpenAI status.",
    };
  } finally {
    clearTimeout(t);
  }
}

// ==================== ROUTE HANDLERS ====================

export async function OPTIONS(req) {
  const origin = req.headers.get("origin") || "";

  if (origin && !isOriginAllowed(origin)) {
    debugLog("CORS preflight rejected:", origin);
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
  // allow GET health/info
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
  const origin = req.headers.get("origin") || "";

  // 1) CORS block
  if (origin && !isOriginAllowed(origin)) {
    debugLog("CORS rejected:", origin);
    return NextResponse.json(
      {
        error: "Origin Not Allowed",
        hint: "Your domain is not in FRONTEND_ORIGINS allowlist.",
      },
      { status: 403, headers: corsHeaders(req, false) }
    );
  }

  const baseHeaders = corsHeaders(req, true);

  // 2) Rate limit
  const clientId = getClientIdentifier(req);
  const rl = checkRateLimit(clientId);

  const rateHeaders = {
    ...baseHeaders,
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(rl.resetIn),
  };

  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Rate Limit Exceeded",
        hint: `Max ${rl.limit} requests per minute. Try again in ${rl.resetIn}s.`,
        retryAfter: rl.resetIn,
      },
      {
        status: 429,
        headers: {
          ...rateHeaders,
          "Retry-After": String(rl.resetIn),
        },
      }
    );
  }

  // 3) Parse JSON safely
  const raw = await req.text().catch(() => "");
  const body = safeJsonParse(raw);

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      {
        error: "Invalid JSON",
        hint: "Body must be valid JSON. Example: { message: 'გამარჯობა' }",
      },
      { status: 400, headers: rateHeaders }
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
      { status: 400, headers: rateHeaders }
    );
  }

  // 5) Call OpenAI
  const start = Date.now();
  const ai = await callOpenAI(messages);

  if (!ai.ok) {
    return NextResponse.json(
      {
        error: ai.error || "AI Request Failed",
        hint: ai.hint || "Unknown error.",
        statusCode: ai.statusCode,
      },
      { status: ai.statusCode || 500, headers: rateHeaders }
    );
  }

  const elapsed = Date.now() - start;

  // 6) Success response (frontend expects reply)
  return NextResponse.json(
    {
      reply: ai.text,
      meta: {
        model: ai.model,
        processingTime: `${elapsed}ms`,
        ...(CONFIG.DEBUG && ai.usage ? { usage: ai.usage } : {}),
      },
    },
    { status: 200, headers: rateHeaders }
  );
}
