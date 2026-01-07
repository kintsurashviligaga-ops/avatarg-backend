// app/api/_utils/cors.js
// Production-ready CORS utils for Next.js (App Router)

// Set allowed origins via env:
// Example:
// CORS_ALLOW_ORIGINS="https://avatarg.app,https://cloud.ai,http://localhost:3000"
const ALLOW_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const ALLOW_METHODS = (process.env.CORS_ALLOW_METHODS || "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  .split(",")
  .map(s => s.trim())
  .join(",");

const ALLOW_HEADERS = (process.env.CORS_ALLOW_HEADERS || "Content-Type, Authorization, X-Requested-With")
  .split(",")
  .map(s => s.trim())
  .join(",");

const EXPOSE_HEADERS = (process.env.CORS_EXPOSE_HEADERS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
  .join(",");

const MAX_AGE = Number(process.env.CORS_MAX_AGE || 86400); // 24h

function isWildcardAllowed() {
  return ALLOW_ORIGINS.length === 1 && ALLOW_ORIGINS[0] === "*";
}

function getRequestOrigin(req) {
  // In Next.js Route Handlers, req.headers is a Headers instance
  try {
    return req?.headers?.get?.("origin") || "";
  } catch {
    return "";
  }
}

function resolveAllowOrigin(origin) {
  // If wildcard: allow any origin (BUT DO NOT use credentials with wildcard)
  if (isWildcardAllowed()) return "*";
  if (!origin) return ""; // no origin -> do not set allow-origin
  return ALLOW_ORIGINS.includes(origin) ? origin : "";
}

export function buildCorsHeaders(req) {
  const origin = getRequestOrigin(req);
  const allowOrigin = resolveAllowOrigin(origin);

  const headers = {
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": String(MAX_AGE),
    // Security / caching correctness:
    "Vary": "Origin",
  };

  // Set allow-origin only when resolved
  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;

  // If you need cookies/Authorization with browser fetch credentials:
  // - You MUST NOT use "*" as allow-origin
  // - And you must set Access-Control-Allow-Credentials: true
  const allowCredentials = String(process.env.CORS_ALLOW_CREDENTIALS || "false") === "true";
  if (allowCredentials && allowOrigin && allowOrigin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  if (EXPOSE_HEADERS) {
    headers["Access-Control-Expose-Headers"] = EXPOSE_HEADERS;
  }

  return headers;
}

// Convenience: return OPTIONS response for preflight
export function corsPreflight(req) {
  const headers = buildCorsHeaders(req);
  return new Response(null, { status: 204, headers });
}

// Convenience: attach CORS to any Response you already return
export function withCors(req, res) {
  const cors = buildCorsHeaders(req);
  const merged = new Headers(res.headers);

  for (const [k, v] of Object.entries(cors)) merged.set(k, v);

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: merged,
  });
    }
