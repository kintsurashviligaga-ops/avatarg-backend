import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../../_utils/cors";

export async function GET() {
  return withCORS(
    NextResponse.json({
      status: "ok",
      service: "Avatar G AI",
      endpoint: "/api/ai/health",
      time: new Date().toISOString()
    })
  );
}

export async function OPTIONS() {
  return corsOPTIONS();
}
