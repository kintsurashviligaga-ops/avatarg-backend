import { NextResponse } from "next/server";
import { withCORS, corsOPTIONS } from "../_utils/cors";

export async function GET(req) {
  return withCORS(
    req,
    NextResponse.json({
      status: "ok",
      service: "Avatar G Backend",
      version: "1.0.0",
      time: new Date().toISOString(),
      env: process.env.NODE_ENV || "unknown",
    })
  );
}

export async function OPTIONS(req) {
  return corsOPTIONS(req);
}
