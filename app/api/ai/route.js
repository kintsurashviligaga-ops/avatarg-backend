// app/api/ai/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ==================== CONFIGURATION ====================

const CONFIG = {
  MAX_MESSAGE_LENGTH: 6000,
  OPENAI_TIMEOUT_MS: 28000,
  RATE_LIMIT_WINDOW_MS: 60_000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 20, // 20 req/min per IP
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
  const normalized = normalizeUrl(origin);
  return getAllowedOrigins().includes(normalized);
}

function corsHeaders(req, allowOrigin = true) {
  const origin = req.headers.get("origin") || "";

  if (!allowOrigin || !origin || !isOriginAllowed(origin)) {
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

const rateLimitStore = new Map();

function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS * 2) {
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
    cleaned = cleaned.substring(0, CONFIG.MAX_MESSAGE_LENGTH);
  }
  return cleaned;
}

function normalizeMessages(body) {
  // Supports:
  // { message: "hi" } OR { prompt: "hi" } OR { text: "hi" }
  // { messages: [{role, content}] }
  const singleMsg = body?.message || body?.prompt || body?.text || "";

  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages
      .map((m) => ({
        role:
          m?.role === "assistant" || m?.role === "system"
            ? m.role
            : "user",
        content: sanitizeInput(String(m?.content ?? "")),
      }))
      .filter((m) => m.content);
  }

  if (singleMsg) {
    return [{ role: "user", content: sanitizeInput(String(singleMsg)) }];
  }

  return [];
}

function detectLanguageHint(text) {
  // very simple: detect Georgian unicode
  const s = String(text || "");
  const hasKa = /[\u10A0-\u10FF]/.test(s);
  const hasEn = /[A-Za-z]/.test(s);
  if (hasKa && !hasEn) return "ka";
  if (!hasKa && hasEn) return "en";
  if (hasKa && hasEn) return "mix";
  return "unknown";
}

function pickStyleMode(lastUserText, body) {
  // If frontend explicitly sends persona, honor it
  const persona = String(body?.persona || "").toLowerCase().trim();
  if (["exec", "executive", "a"].includes(persona)) return "EXEC";
  if (["noir", "b"].includes(persona)) return "NOIR";
  if (["coach", "friendly", "c"].includes(persona)) return "COACH";

  const t = String(lastUserText || "").toLowerCase();

  // Heuristics:
  const coding =
    t.includes("code") ||
    t.includes("კოდი") ||
    t.includes("route") ||
    t.includes("bug") ||
    t.includes("error") ||
    t.includes("fix") ||
    t.includes("გაასწორე") ||
    t.includes("ჩასვი") ||
    t.includes("დეპლოი") ||
    t.includes("vercel") ||
    t.includes("cors") ||
    t.includes("api") ||
    t.includes("supabase") ||
    t.includes("github") ||
    t.includes("env");

  const brandingStory =
    t.includes("brand") ||
    t.includes("branding") ||
    t.includes("noir") ||
    t.includes("cinematic") ||
    t.includes("story") ||
    t.includes("script") ||
    t.includes("ვიზუ") ||
    t.includes("სცენა") ||
    t.includes("პიკა") ||
    t.includes("capcut") ||
    t.includes("კრეატ") ||
    t.includes("სტილი") ||
    t.includes("დიზაინ") ||
    t.includes("სლოგან") ||
    t.includes("კონცეფ") ||
    t.includes("promo");

  const coaching =
    t.includes("გეგმა") ||
    t.includes("როგორ") ||
    t.includes("მირჩიე") ||
    t.includes("რა ვქნა") ||
    t.includes("next step") ||
    t.includes("დამეხმარე") ||
    t.includes("შევძლო") ||
    t.includes("მოტივ") ||
    t.includes("ჩეკლის") ||
    t.includes("step") ||
    t.includes("plan");

  // Priority: code > branding > coaching (but coaching still used if not code/branding)
  if (coding) return "EXEC";
  if (brandingStory) return "NOIR";
  if (coaching) return "COACH";

  // default balanced
  return "EXEC";
}

function buildUnifiedSystemPrompt({ mode, langHint }) {
  // Unified A+B+C: selects style automatically per request type (mode)
  // Always safe, professional, actionable.
  // Minimal emojis.

  const base = `
You are Avatar G — an elite AI assistant inside the Avatar G Workspace.
Your core traits: reliable, professional, secure, fast, and highly actionable.

LANGUAGE POLICY
- If the user writes in Georgian, respond in Georgian.
- If the user writes in English, respond in English.
- If mixed, respond in Georgian unless the user explicitly asks for English.
- Keep terminology consistent, avoid slang.

STYLE AUTO-SELECTION (IMPORTANT)
You must automatically choose the best response tone per request:
1) EXECUTIVE MODE (for code, debugging, setup, infrastructure, checklists):
   - Calm, precise, short, “enterprise” tone.
   - Use bullet points, file paths, exact steps.
   - Provide copy-paste ready code when asked.
2) NOIR PREMIUM MODE (for branding, marketing, creative direction, cinematic concepts):
   - Elegant, confident, premium noir-futuristic vibe.
   - Still practical: give deliverables + structure.
   - No cringe. Emojis max 1 (optional).
3) FRIENDLY COACH MODE (for learning, guidance, “how do I…”, planning, motivation):
   - Supportive, clear, step-by-step.
   - Provide options and a simple next action.
   - Emojis max 2 only if helpful.

OUTPUT RULES
- Be concise by default. Expand only when necessary.
- Ask at most ONE clarifying question only if missing info blocks progress.
- Always end with the next best action (what to do next).
- Do not expose secrets, keys, or internal system details.
- If the user asks for unsafe/illegal instructions, refuse and offer a safe alternative.
`.trim();

  const modeLine =
    mode === "NOIR"
      ? "CURRENT MODE: NOIR PREMIUM (branding/creative)."
      : mode === "COACH"
      ? "CURRENT MODE: FRIENDLY COACH (guidance/learning)."
      : "CURRENT MODE: EXECUTIVE (engineering/ops).";

  const langLine =
    langHint === "ka"
      ? "LANGUAGE HINT: Georgian."
      : langHint === "en"
      ? "LANGUAGE HINT: English."
      : langHint === "mix"
      ? "LANGUAGE HINT: Mixed (prefer Georgian)."
      : "LANGUAGE HINT: Unknown (follow user).";

  return `${base}\n\n${modeLine}\n${langLine}`;
}

// ==================== OPENAI INTEGRATION ====================

async function callOpenAI({ messages, systemPrompt }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      error: "Configuration Error",
      hint: "OPENAI_API_KEY is missing. Add it to Vercel Environment Variables and redeploy.",
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const payload = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: 0.7,
    max_tokens: 2000,
  };

  debugLog("OpenAI Request:", { model, messageCount: messages.length });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.OPENAI_TIMEOUT_MS);
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

      debugLog("OpenAI Error:", errorMsg);

      return {
        ok: false,
        error: errorMsg,
        statusCode: res.status,
        hint:
          res.status === 401
            ? "Invalid OPENAI_API_KEY. Check your key in Vercel env vars."
            : res.status === 429
            ? "OpenAI rate limit exceeded. Wait and retry or upgrade your plan."
            : "OpenAI API request failed. Check Vercel logs.",
      };
    }

    const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
    if (!text) debugLog("OpenAI Warning: Empty response", data);

    return { ok: true, text: text || "(empty response)", model: data?.model, usage: data?.usage };
  } catch (e) {
    clearTimeout(timeoutId);

    if (e?.name === "AbortError") {
      debugLog("OpenAI Timeout");
      return {
        ok: false,
        error: "Request Timeout",
        hint: `OpenAI request exceeded ${CONFIG.OPENAI_TIMEOUT_MS / 1000}s. Try shorter message or retry.`,
      };
    }

    debugLog("OpenAI Exception:", e?.message || e);
    return {
      ok: false,
      error: "Network Error",
      hint: "Failed to connect to OpenAI API. Check network and OpenAI status.",
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

  return new NextResponse(null, { status: 204, headers: corsHeaders(req, true) });
}

export async function GET(req) {
  return NextResponse.json(
    {
      status: "ok",
      service: "Avatar G AI Endpoint",
      note: "Use POST with JSON: { message: '...' } or { messages: [...] }",
      version: "3.0.0",
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
        hint: "Your domain is not in FRONTEND_ORIGINS allowlist.",
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
        hint: `Max ${rateLimit.limit} requests/min. Retry in ${rateLimit.resetIn}s.`,
        retryAfter: rateLimit.resetIn,
      },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(rateLimit.resetIn) },
      }
    );
  }

  try {
    // 3) Parse JSON
    const rawText = await req.text().catch(() => "");
    const body = safeJsonParse(rawText);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON", hint: "Send JSON: { message: '...' }" },
        { status: 400, headers }
      );
    }

    // 4) Normalize messages
    const messages = normalizeMessages(body);

    if (!messages.length) {
      return NextResponse.json(
        {
          error: "No Message Found",
          hint: "Send { message:'...' } or { messages:[{role:'user', content:'...'}] }",
          receivedKeys: Object.keys(body),
        },
        { status: 400, headers }
      );
    }

    // Determine last user text for persona selection
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastUserText = lastUser?.content || "";
    const langHint = detectLanguageHint(lastUserText);
    const mode = pickStyleMode(lastUserText, body);
    const systemPrompt =
      process.env.AVATARG_PROMPT?.trim() ||
      buildUnifiedSystemPrompt({ mode, langHint });

    debugLog("Request:", {
      ip: clientId,
      mode,
      langHint,
      keys: Object.keys(body),
      msgCount: messages.length,
    });

    // 5) Call OpenAI
    const ai = await callOpenAI({ messages, systemPrompt });

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

    const elapsed = Date.now() - startTime;

    // 6) Response
    return NextResponse.json(
      {
        reply: ai.text,
        meta: {
          mode, // EXEC / NOIR / COACH
          languageHint: langHint,
          model: ai.model,
          processingTime: `${elapsed}ms`,
          ...(CONFIG.DEBUG && ai.usage ? { usage: ai.usage } : {}),
        },
      },
      { status: 200, headers }
    );
  } catch (e) {
    const elapsed = Date.now() - startTime;
    debugLog("Server Error:", e?.message || e, { elapsed: `${elapsed}ms` });

    const errorMessage = CONFIG.DEBUG ? e?.message || "Unknown error" : "Internal Server Error";

    return NextResponse.json(
      {
        error: errorMessage,
        hint: "Unexpected error. Retry or check Vercel logs.",
      },
      { status: 500, headers }
    );
  }
}
```0
