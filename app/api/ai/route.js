import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../_utils/cors";

export async function POST(req) {
  const body = await req.json();

  return withCORS(
    NextResponse.json({ ok: true })
  );
}

export async function OPTIONS() {
  return corsOPTIONS();
}
