import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "avatarg-backend",
    version: process.env.APP_VERSION || "0.1.0",
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    time: new Date().toISOString(),
  });
}
