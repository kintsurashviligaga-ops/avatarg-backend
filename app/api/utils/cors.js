import { NextResponse } from "next/server";

/**
 * Avatar G — Production CORS Utility (Hardened + Practical)
 *
 * ENV (recommended):
 * FRONTEND_ORIGINS="https://avatar-g.vercel.app,https://avatar-g-git-main-xxx.vercel.app"
 * FRONTEND_ORIGIN_REGEX="^https:\\/\\/avatar-g(-[a-z0-9-]+)?\\.vercel\\.app$"
 *
 * If you do NOT use cookies -> keep credentials OFF (default).
 * If you DO use cookies -> set CORS_ALLOW_CREDENTIALS="true"
 */

function getAllowedOrigins() {
  const raw = process.env.FRONTEND_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function getOrigin(req) {
  // Next.js Request headers are lower-case, but keep both for safety
  return req.headers.get("origin") || req.headers.get("Origin") || "";
}

function isAllowedOrigin(origin) {
  if (!origin) return false;

  const normalized = origin.replace(/\/$/, "");

  // 0) block "null" origin (file://, sandboxed iframes)
  if (normalized === "null") return false;

  // 1) explicit allowlist
  const allowList = getAllowedOrigins();
  if (allowList.includes(normalized)) return true;

  // 2) dev defaults
  if (
    normalized === "http://localhost:3000" ||
    normalized === "http://localhost:5173" ||
    normalized === "http://127.0.0.1:3000"
  ) {
    return true;
  }

  // 3) regex pattern (preview deployments)
  const reRaw = process.env.FRONTEND_ORIGIN_REGEX;
  if (reRaw) {
    try {
      const re = new RegExp(reRaw);
      if (re.test(normalized)) return true;
    } catch (e) {
      console.warn("[CORS] Invalid FRONTEND_ORIGIN_REGEX:", e?.message || e);
    }
  }

  // 4) safe fallback (main frontend)
  if (normalized === "https://avatar-g.vercel.app") return true;

  return false;
}

function setVary(headers, value) {
  const prev = headers.get("Vary");
  if (!prev) {
    headers.set("Vary", value);
    return;
  }
  // merge without duplicates
  const parts = prev.split(",").map((s) => s.trim().toLowerCase());
  if (!parts.includes(value.toLowerCase())) {
    headers.set("Vary", `${prev}, ${value}`);
  }
}

function applyCorsHeaders(headers, origin) {
  // Allow what your API actually uses
  headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-Client-Version"
  );
  headers.set("Access-Control-Max-Age", "86400");
  setVary(headers, "Origin");

  const allowCredentials =
    (process.env.CORS_ALLOW_CREDENTIALS || "").toLowerCase() === "true";

  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);

    // Only set credentials if you truly need cookies/session
    if (allowCredentials) {
      headers.set("Access-Control-Allow-Credentials", "true");
    } else {
      headers.delete("Access-Control-Allow-Credentials");
    }
  } else if (origin) {
    // Do NOT set Allow-Origin for rejected origins (browser will block)
    console.warn("[CORS] Rejected origin:", origin);
    headers.delete("Access-Control-Allow-Origin");
    headers.delete("Access-Control-Allow-Credentials");
  }

  return headers;
}

/** Wrap NextResponse with CORS headers */
export function withCORS(req, res) {
  const origin = getOrigin(req);
  applyCorsHeaders(res.headers, origin);
  return res;
}

/** OPTIONS preflight */
export function corsOPTIONS(req) {
  const origin = getOrigin(req);
  const res = new NextResponse(null, { status: 200 }); // 200 is safest for proxies/CDNs
  applyCorsHeaders(res.headers, origin);
  return res;
}

/** Optional helper */
export function validateOrigin(req) {
  const origin = getOrigin(req);
  return !origin || isAllowedOrigin(origin);
              }
