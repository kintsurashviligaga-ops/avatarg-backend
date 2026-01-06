import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "avatarg-backend",
    version: "0.1.0",
    status: "ok",
    time: new Date().toISOString(),
  });
}
