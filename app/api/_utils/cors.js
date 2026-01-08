import { NextResponse } from "next/server";

/**
 * ✅ FINAL CORS (Avatar G – Production Safe)
 * - Works with browser, Vercel, mobile, Supabase UI
 * - Fixes "Failed to fetch / CORS error"
 */

export function withCORS(req, res) {
  const origin = req.headers.get("origin");

  const headers = new Headers(res.headers);

  // ✅ Allow requesting origin dynamically
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

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
  const origin = req.headers.get("origin");

  const headers = new Headers();

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");

  return new NextResponse(null, {
    status: 204,
    headers,
  });
}
