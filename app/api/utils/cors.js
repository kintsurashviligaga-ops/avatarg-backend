import { NextResponse } from "next/server";

/**
 * AVATAR G — Production CORS Utility (Hardened)
 *
 * ENV (recommended):
 * - FRONTEND_ORIGINS="https://avatar-g.vercel.app,https://yourdomain.com"
 * - FRONTEND_ORIGIN_REGEX="^https:\\/\\/avatar-g(-[a-z0-9-]+)?\\.vercel\\.app$"
 *
 * Why this version:
 * - Fixes "Failed to fetch" / CORS errors
 * - Proper OPTIONS preflight
 * - Safe with credentials (never uses "*")
 * - ✅ IMPORTANT FIX: does NOT allow all *.vercel.app
 *   Instead allows only avatar-g deployments via regex or allowlist
 */

function getAllowedOrigins() {
  const raw = process.env.FRONTEND_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const normalized = origin.replace(/\/$/, "");

  // ✅ Step 1: explicit allowlist
  const allowList = getAllowedOrigins();
  if (allowList.includes(normalized)) return true;

  // ✅ Step 2: dev defaults
  if (normalized === "http://localhost:3000") return true;
  if (normalized === "http://localhost:5173") return true;
  if (normalized === "http://127.0.0.1:3000") return true;

  // ✅ Step 3: optional regex (preview deployments)
  const reRaw = process.env.FRONTEND_ORIGIN_REGEX;
  if (reRaw) {
    try {
      const re = new RegExp(reRaw);
      if (re.test(normalized)) return true;
    } catch (e) {
      console.warn("[CORS] Invalid FRONTEND_ORIGIN_REGEX:", e?.message || e);
    }
  }

  // ✅ Step 4: SAFE fallback (ONLY your production frontend)
  if (normalized === "https://avatar-g.vercel.app") return true;

  return false;
}

function applyCorsHeaders(headers, origin) {
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-Client-Version"
  );
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");

  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  } else if (origin) {
    // Don’t set Allow-Origin for untrusted origins
    console.warn("[CORS] Rejected origin:", origin);
  }

  return headers;
}

/** Wrap existing NextResponse with CORS headers */
export function withCORS(req, res) {
  const origin = req.headers.get("origin") || req.headers.get("Origin");
  applyCorsHeaders(res.headers, origin);
  return res;
}

/** OPTIONS preflight */
export function corsOPTIONS(req) {
  const origin = req.headers.get("origin") || req.headers.get("Origin");
  const res = new NextResponse(null, { status: 204 });
  applyCorsHeaders(res.headers, origin);
  return res;
}

/** Optional helper */
export function validateOrigin(req) {
  const origin = req.headers.get("origin") || req.headers.get("Origin");
  return !origin || isAllowedOrigin(origin);
}
