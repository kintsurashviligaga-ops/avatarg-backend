import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { title, style, lyrics, fileUrl } = body;

    if (!fileUrl) {
      return NextResponse.json(
        { error: "fileUrl missing" },
        { status: 400 }
      );
    }

    // აქ შეგიძლია:
    // 1. Supabase-ში შეინახო
    // 2. DB დაამატო
    // 3. მომავალში Suno metadata დაუკავშირო

    return NextResponse.json({
      ok: true,
      item: {
        id: crypto.randomUUID(),
        title,
        style,
        lyrics,
        url: fileUrl,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Upload failed" },
      { status: 500 }
    );
  }
}
