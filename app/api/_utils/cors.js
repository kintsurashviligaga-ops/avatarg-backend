import { NextResponse } from "next/server";

/**
 * ✅ CORS helper for Next.js App Router route handlers
 * - Allows browser calls from your frontend domain(s)
 * - Works with OPTIONS preflight
 */

// შეცვალე შენი frontend დომენებით:
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://avatarg.app",          // example (change)
  "https://www.avatarg.app",      // example (change)
];

function getOrigin(req) {
  return req.headers.get("origin") || "";
}

function isAllowed(origin) {
  // allow same-origin requests (no origin header)
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

export function withCORS(req, res) {
  const origin = getOrigin(req);

  // If origin isn't allowed, still respond but don't grant browser access
  const allowOrigin = isAllowed(origin) ? origin : "";

  const headers = new Headers(res.headers);
  if (allowOrigin) headers.set("Access-Control-Allow-Origin", allowOrigin);

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");

  return new NextResponse(res.body, {
    status: res.status,
    headers,
  });
}

export function corsOPTIONS(req) {
  const origin = getOrigin(req);
  const allowOrigin = isAllowed(origin) ? origin : "";

  const headers = new Headers();
  if (allowOrigin) headers.set("Access-Control-Allow-Origin", allowOrigin);

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");

  return new NextResponse(null, { status: 204, headers });
}
