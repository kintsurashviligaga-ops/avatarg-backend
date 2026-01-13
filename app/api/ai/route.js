// app/api/ai/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

const CONFIG = {
  MAX_MESSAGE_LENGTH: 6000,
  OPENAI_TIMEOUT_MS: 28000,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 20,
  DEBUG: process.env.DEBUG === "true",
  MAX_CONTEXT_MESSAGES: 10,
  MEMORY_MAX_SUMMARY: 10,
  MEMORY_MAX_TEXT: 150
};

const MOOD_PRESETS = {
  auto: "AUTO mode: analyze user intent and respond appropriately. Default: Georgian-first, premium, concise then details.",
  executive: "EXECUTIVE: professional, direct, structured. Business-focused. Concise then details if needed.",
  friendly: "FRIENDLY: warm, helpful, encouraging. Premium but approachable. Clear and supportive.",
  technical: "TECHNICAL: precise, explicit, code-ready. Error-aware, structured, detailed.",
  noir: "NOIR: cinematic noir atmosphere. Still helpful and clear but with dramatic flair.",
  hype: "HYPE: energetic, motivational, confident. Action-oriented, still correct and safe."
};

const rateLimitStore = new Map();
let supabaseAdmin = null;

function initSupabase() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return supabaseAdmin;
  } catch (e) {
    console.error("[Supabase Init Error]", e);
    return null;
  }
}

function debugLog(...args) {
  if (CONFIG.DEBUG) console.log("[AI Route]", ...args);
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function sanitizeInput(input) {
  if (typeof input !== "string") return "";
  let cleaned = input.replace(/\0/g, "").trim();
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  if (cleaned.length > CONFIG.MAX_MESSAGE_LENGTH) cleaned = cleaned.substring(0, CONFIG.MAX_MESSAGE_LENGTH);
  return cleaned;
}

function isGeorgianText(text) {
  return /[\u10A0-\u10FF]/.test(String(text || ""));
}

function normalizeMessages(body) {
  const singleMsg = body?.message || body?.prompt || body?.text || "";
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages
      .map((m) => ({
        role: (m?.role === "assistant" || m?.role === "system") ? m.role : "user",
        content: sanitizeInput(String(m?.content ?? ""))
      }))
      .filter((m) => m.content)
      .slice(-CONFIG.MAX_CONTEXT_MESSAGES);
  }
  if (singleMsg) return [{ role: "user", content: sanitizeInput(String(singleMsg)) }];
  return [];
}

/** --------- CORS (FIXED) --------- **/
function getAllowedOrigins() {
  const env = process.env.FRONTEND_ORIGINS || "";
  const list = env.split(",").map(s => s.trim()).filter(Boolean);
  const defaults = [
    "https://avatar-g.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173"
  ];
  const normalize = (u) => String(u || "").replace(/\/+$/, "");
  const merged = [...list, ...defaults].map(normalize).filter(Boolean);
  return Array.from(new Set(merged));
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  const normalized = String(origin).replace(/\/+$/, "");
  return allowed.includes(normalized);
}

function corsHeaders(req, allowOrigin = true) {
  const origin = req.headers.get("origin") || "";
  const base = { "Content-Type": "application/json" };

  // Same-origin / server-to-server requests: origin შეიძლება საერთოდ არ იყოს
  // ასეთ დროს CORS headers არ არის საჭირო
  if (!origin) return base;

  if (!allowOrigin || !isOriginAllowed(origin)) return base;

  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

/** --------- Rate Limit --------- **/
function cleanupRateLimit() {
  const now = Date.now();
  const expired = [];
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS * 2) expired.push(key);
  }
  expired.forEach(key => rateLimitStore.delete(key));
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
    const resetIn = Math.ceil((CONFIG.RATE_LIMIT_WINDOW_MS - (now - record.windowStart)) / 1000);
    return { allowed: false, resetIn, limit: CONFIG.RATE_LIMIT_MAX_REQUESTS };
  }
  return { allowed: true, remaining: CONFIG.RATE_LIMIT_MAX_REQUESTS - record.count, limit: CONFIG.RATE_LIMIT_MAX_REQUESTS };
}

function getClientIdentifier(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** --------- Mood --------- **/
function inferMoodFromText(text) {
  const t = String(text || "").toLowerCase();
  const looksLikeCode =
    /```/.test(t) ||
    /\b(function|const|let|var|import|export|class|return|await|async)\b/.test(t) ||
    /[{}<>]=?/.test(t) ||
    /\b(error|bug|stack|trace|cors|vercel|nextjs|api|route|json)\b/.test(t);

  const asksPlan = /\b(plan|checklist|roadmap|steps|გეგმა|ჩეკლისტ|ეტაპ|საფეხურ|დაგეგმე)\b/.test(t);
  const asksImage = /\b(image|photo|picture|prompt|render|logo|banner|thumbnail|სურათ|ფოტო|ლოგო|დიზაინ)\b/.test(t);
  const marketingHype = /\b(launch|viral|ads|marketing|sales|growth|go-to-market|cta|viral|ჰაიპ|მოტივ|რეკლამ|გაყიდვ)\b/.test(t);
  const noirCue = /\b(noir|cinematic|mystic|dark|ატმოსფერული|ნუარ|კინემატოგრაფიული)\b/.test(t);

  if (looksLikeCode) return "technical";
  if (asksPlan) return "executive";
  if (asksImage) return "friendly";
  if (noirCue) return "noir";
  if (marketingHype) return "hype";
  return "friendly";
}

function resolveMood(requestedMood, lastUserText) {
  const m = String(requestedMood || "auto").trim().toLowerCase();
  if (m && m !== "auto" && MOOD_PRESETS[m]) return m;
  return inferMoodFromText(lastUserText);
}

function buildSystemPrompt({ mood, lang }) {
  const moodInstruction = MOOD_PRESETS[mood] || MOOD_PRESETS.auto;
  const languageRule = lang === "ka"
    ? "Reply in Georgian. If user writes in English, you MAY reply in English, but default is Georgian."
    : "Reply in the user's language (likely English). If they switch to Georgian, reply in Georgian.";

  return `You are Avatar G — a premium assistant inside "Avatar G Workspace".

SIGNATURE RESPONSE RULES (always):
- First line: the best direct answer in 1–2 sentences (concise).
- Then: structured details (bullets/steps) only if needed.
- Be correct, safe, and practical. No fluff.
- Keep a premium, clear, Georgian-first brand voice.

LANGUAGE:
- ${languageRule}

MOOD:
- ${moodInstruction}
`.trim();
}

async function callOpenAI({ messages, mood, lang }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      statusCode: 500,
      error: "Configuration Error",
      hint: "OPENAI_API_KEY is missing. Add it to Vercel environment variables and redeploy."
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const payload = {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt({ mood, lang }) },
      ...messages
    ],
    temperature: 0.7,
    max_tokens: 1800
  };

  debugLog("OpenAI Request:", { model, mood, lang, messageCount: messages.length });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.OPENAI_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data?.error?.message || data?.message || `OpenAI API error: HTTP ${res.status}`;
      return {
        ok: false,
        statusCode: res.status,
        error: errorMsg,
        hint: res.status === 401
          ? "Invalid OPENAI_API_KEY. Check your API key in Vercel environment variables."
          : res.status === 429
          ? "OpenAI rate limit exceeded. Wait and retry."
          : "OpenAI API request failed. Check logs for details."
      };
    }

    const text = data?.choices?.[0]?.message?.content || "";
    return { ok: true, text: text || "(empty response)", model: data?.model, usage: data?.usage };
  } catch (e) {
    clearTimeout(timeoutId);

    if (e?.name === "AbortError") {
      return {
        ok: false,
        statusCode: 504,
        error: "Request Timeout",
        hint: `OpenAI request exceeded ${Math.round(CONFIG.OPENAI_TIMEOUT_MS / 1000)}s timeout. Try a shorter message or retry.`
      };
    }

    return {
      ok: false,
      statusCode: 502,
      error: "Network Error",
      hint: "Failed to connect to OpenAI API. Check network connectivity and API status."
    };
  }
}

/** --------- Memory (Supabase) --------- **/
async function getMemory(conversationId) {
  const sb = initSupabase();
  if (!sb || !conversationId) return { preferences: {}, summary: [] };
  try {
    const { data, error } = await sb
      .from("avatar_g_memory")
      .select("memory")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (error) throw error;
    const mem = data?.memory || {};
    return {
      preferences: mem.preferences || {},
      summary: Array.isArray(mem.summary) ? mem.summary.slice(-CONFIG.MEMORY_MAX_SUMMARY) : []
    };
  } catch (e) {
    debugLog("getMemory error:", e);
    return { preferences: {}, summary: [] };
  }
}

async function setMemory(conversationId, memory) {
  const sb = initSupabase();
  if (!sb || !conversationId) return;
  try {
    const normalized = {
      preferences: memory.preferences || {},
      summary: Array.isArray(memory.summary) ? memory.summary.slice(-CONFIG.MEMORY_MAX_SUMMARY) : []
    };

    const { error } = await sb
      .from("avatar_g_memory")
      .upsert({
        conversation_id: conversationId,
        memory: normalized,
        updated_at: new Date().toISOString()
      }, { onConflict: "conversation_id" });

    if (error) throw error;
  } catch (e) {
    debugLog("setMemory error:", e);
  }
}

async function clearMemory(conversationId) {
  const sb = initSupabase();
  if (!sb || !conversationId) return;
  try {
    const { error } = await sb
      .from("avatar_g_memory")
      .delete()
      .eq("conversation_id", conversationId);

    if (error) throw error;
  } catch (e) {
    debugLog("clearMemory error:", e);
  }
}

/** --------- OPTIONS --------- **/
export async function OPTIONS(req) {
  const origin = req.headers.get("origin") || "";

  // თუ origin არსებობს და არაა allowlist-ში — 403
  if (origin && !isOriginAllowed(origin)) {
    debugLog("CORS Preflight Rejected:", origin);
    return new NextResponse(null, { status: 403, headers: { "Content-Type": "text/plain" } });
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders(req, true) });
}

/** --------- GET: health/memory/info via op=... (FIXED) --------- **/
export async function GET(req) {
  const origin = req.headers.get("origin") || "";
  if (origin && !isOriginAllowed(origin)) {
    return NextResponse.json(
      { error: "Origin Not Allowed", hint: "Your domain is not in the FRONTEND_ORIGINS allowlist.", code: "CORS_DENY" },
      { status: 403, headers: corsHeaders(req, false) }
    );
  }

  const headers = corsHeaders(req, true);
  const { searchParams } = new URL(req.url);
  const op = String(searchParams.get("op") || "").toLowerCase();

  if (op === "health") {
    return NextResponse.json(
      {
        status: "ok",
        service: "Avatar G AI",
        version: "5.0.1",
        time: new Date().toISOString(),
        allowlist: CONFIG.DEBUG ? getAllowedOrigins() : undefined
      },
      { status: 200, headers }
    );
  }

  if (op === "memory") {
    const conversationId = searchParams.get("conversation_id");
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversation_id required", hint: "Use ?op=memory&conversation_id=...", code: "MISSING_CONV_ID" },
        { status: 400, headers }
      );
    }
    const memory = await getMemory(conversationId);
    return NextResponse.json({ conversation_id: conversationId, memory }, { status: 200, headers });
  }

  return NextResponse.json(
    {
      status: "ok",
      note: "Use POST /api/ai for chat. Use GET /api/ai?op=health. Use GET /api/ai?op=memory&conversation_id=...",
      code: "OK"
    },
    { status: 200, headers }
  );
}

/** --------- POST: chat OR memory via op=... (FIXED) --------- **/
export async function POST(req) {
  const startTime = Date.now();

  const origin = req.headers.get("origin") || "";
  if (origin && !isOriginAllowed(origin)) {
    debugLog("CORS Rejected:", origin);
    return NextResponse.json(
      { error: "Origin Not Allowed", hint: "Your domain is not in the FRONTEND_ORIGINS allowlist.", code: "CORS_DENY" },
      { status: 403, headers: corsHeaders(req, false) }
    );
  }

  const headers = corsHeaders(req, true);

  // op=memory POST მხარდაჭერა (clear/update)
  const { searchParams } = new URL(req.url);
  const op = String(searchParams.get("op") || "").toLowerCase();

  const rawText = await req.text().catch(() => "");
  const body = safeJsonParse(rawText);

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid JSON", hint: "Request body must be valid JSON.", code: "BAD_JSON" },
      { status: 400, headers }
    );
  }

  if (op === "memory") {
    const conversationId = String(body?.conversation_id || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversation_id required", hint: "Send { conversation_id, action:'clear' }", code: "MISSING_CONV_ID" },
        { status: 400, headers }
      );
    }

    if (action === "clear") {
      await clearMemory(conversationId);
      return NextResponse.json({ success: true, message: "Memory cleared" }, { status: 200, headers });
    }

    if (action === "update") {
      const data = body?.data;
      if (!data || typeof data !== "object") {
        return NextResponse.json(
          { error: "Invalid data", hint: "Send { action:'update', data:{...} }", code: "BAD_MEMORY_DATA" },
          { status: 400, headers }
        );
      }
      await setMemory(conversationId, data);
      return NextResponse.json({ success: true, message: "Memory updated" }, { status: 200, headers });
    }

    return NextResponse.json(
      { error: "Invalid action", hint: "Use action: 'clear' or 'update'", code: "BAD_ACTION" },
      { status: 400, headers }
    );
  }

  // Rate limit (only for chat)
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(clientId);
  if (!rateLimit.allowed) {
    debugLog("Rate Limit Exceeded:", clientId);
    return NextResponse.json(
      {
        error: "Rate Limit Exceeded",
        hint: `Maximum ${rateLimit.limit} requests per minute. Try again in ${rateLimit.resetIn} seconds.`,
        code: "RATE_LIMIT",
        retryAfter: rateLimit.resetIn
      },
      { status: 429, headers: { ...headers, "Retry-After": String(rateLimit.resetIn) } }
    );
  }

  try {
    const messages = normalizeMessages(body);
    if (!messages.length) {
      return NextResponse.json(
        { error: "No Message Found", hint: "Send { message: '...' }", code: "NO_MESSAGE" },
        { status: 400, headers }
      );
    }

    const lastUser = [...messages].reverse().find(m => m.role === "user")?.content || "";
    const lang = isGeorgianText(lastUser) ? "ka" : "en";
    const requestedMood = body?.mood || "auto";
    const mood = resolveMood(requestedMood, lastUser);

    const conversationId = String(body?.conversation_id || "").trim();
    const memory = conversationId ? await getMemory(conversationId) : null;

    const memorySystemMessage = memory
      ? {
          role: "system",
          content: `Memory (use lightly): preferences=${JSON.stringify(memory.preferences || {})}; recent_summary=${JSON.stringify((memory.summary || []).slice(-CONFIG.MEMORY_MAX_SUMMARY))}`
        }
      : null;

    const aiInputMessages = memorySystemMessage ? [memorySystemMessage, ...messages] : messages;

    const ai = await callOpenAI({ messages: aiInputMessages, mood, lang });

    if (!ai.ok) {
      return NextResponse.json(
        { error: ai.error || "AI Request Failed", hint: ai.hint || "Unknown error occurred.", code: "AI_FAIL" },
        { status: ai.statusCode || 500, headers }
      );
    }

    // Update memory (best-effort)
    if (conversationId) {
      const newMem = memory ? { ...memory } : { preferences: {}, summary: [] };
      newMem.preferences = {
        ...(newMem.preferences || {}),
        preferred_language: lang,
        preferred_mood: requestedMood && requestedMood !== "auto" ? requestedMood : (newMem.preferences?.preferred_mood || "auto"),
        last_mood_used: mood
      };

      const pushSummary = (role, content) => ({
        role,
        content: String(content || "").slice(0, CONFIG.MEMORY_MAX_TEXT)
      });

      const summaryArr = Array.isArray(newMem.summary) ? newMem.summary : [];
      summaryArr.push(pushSummary("user", lastUser));
      summaryArr.push(pushSummary("assistant", ai.text));
      newMem.summary = summaryArr.slice(-CONFIG.MEMORY_MAX_SUMMARY);
      await setMemory(conversationId, newMem);
    }

    const elapsed = Date.now() - startTime;

    return NextResponse.json(
      {
        text: ai.text,
        mood_used: mood,
        meta: {
          model: ai.model,
          processingTime: `${elapsed}ms`,
          conversation_id: conversationId
        }
      },
      { status: 200, headers }
    );
  } catch (e) {
    const errorMessage = CONFIG.DEBUG ? e?.message || "Unknown error" : "Internal Server Error";
    return NextResponse.json(
      { error: errorMessage, hint: "An unexpected error occurred. Please try again.", code: "SERVER_ERROR" },
      { status: 500, headers }
    );
  }
}