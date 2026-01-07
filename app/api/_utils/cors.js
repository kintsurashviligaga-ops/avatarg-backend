import { NextResponse } from "next/server";

export function withCORS(response) {
  response.headers.set(
    "Access-Control-Allow-Origin",
    "https://avatar-g.vercel.app"
  );
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  return response;
}

export function corsOPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  return withCORS(res);
}
