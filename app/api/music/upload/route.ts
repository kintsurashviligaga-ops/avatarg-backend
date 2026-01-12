import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

// ================= ENV =================
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET = process.env.R2_BUCKET!;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL!;
// example: https://cdn.yourdomain.com  OR  https://<bucket>.<account>.r2.dev

// ================= VALIDATION =================
if (
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET ||
  !R2_PUBLIC_BASE_URL
) {
  console.warn("⚠️ R2 environment variables are missing");
}

// ================= R2 CLIENT =================
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ================= POST =================
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "audio/mpeg";
    const audioBuffer = await req.arrayBuffer();

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: "Empty audio body" },
        { status: 400 }
      );
    }

    const fileName = `music/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.mp3`;

    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: fileName,
        Body: Buffer.from(audioBuffer),
        ContentType: contentType,
        CacheControl: "public, max-age=31536000",
      })
    );

    const publicUrl = `${R2_PUBLIC_BASE_URL}/${fileName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
    });
  } catch (err: any) {
    console.error("❌ R2 upload error:", err);
    return NextResponse.json(
      {
        error: "Upload failed",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
