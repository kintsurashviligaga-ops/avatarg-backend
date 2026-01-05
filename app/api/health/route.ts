import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Avatar G Backend",
    timestamp: new Date().toISOString(),
  });
}
