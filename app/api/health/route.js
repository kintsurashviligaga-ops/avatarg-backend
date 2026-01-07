import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../_utils/cors";

export async function GET() {
  return withCORS(
    NextResponse.json({ status: "ok" })
  );
}

export async function OPTIONS() {
  return corsOPTIONS();
}
