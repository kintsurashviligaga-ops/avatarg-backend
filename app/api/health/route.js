import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAllowedOrigins() {
  const raw =
    process.env.CORS_ALLOW_ORIGINS ||
    process.env.FRONTEND_ORIGIN ||
    process.env.NEXT_PUBLIC_FRONTEND_ORIGIN ||
    "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(origin) {
  const allowed = getAllowedOrigins();
  const isAllowed = origin && allowed.includes(origin);

  const headers = new Headers();
  if (isAllowed) headers.set("Access-Control-Allow-Origin", origin!);

  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set(
    "Access-Control-Allow-Credentials",
    (process.env.CORS_ALLOW_CREDENTIALS || "true").toLowerCase()
  );

  return headers;
}

export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req) {
  const origin = req.headers.get("origin");
  const res = NextResponse.json({ ok: true, service: "backend", ts: Date.now() });
  corsHeaders(origin).forEach((v, k) => res.headers.set(k, v));
  return res;
}