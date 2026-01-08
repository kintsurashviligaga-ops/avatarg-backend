import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../_utils/cors";

export async function GET(req) {
  return withCORS(
    req,
    NextResponse.json({
      status: "ok",
      service: "Avatar G Backend",
      time: new Date().toISOString(),
    })
  );
}

export async function OPTIONS(req) {
  return corsOPTIONS(req);
}
