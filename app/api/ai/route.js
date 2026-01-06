import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "avatarg-backend",
    endpoint: "ai",
  });
}

export async function POST(req) {
  try {
    const body = await req.json();
    return NextResponse.json({
      status: "ok",
      service: "avatarg-backend",
      endpoint: "ai",
      input: body,
    });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
