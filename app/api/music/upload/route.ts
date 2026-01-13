import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

// ================= ENV (safe) =================
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || ""; 
// example: https://cdn.yourdomain.com  OR  https://<bucket>.<account>.r2.dev

function missingEnv() {
  const missing: string[] = [];
  if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!R2_BUCKET) missing.push("R2_BUCKET");
  if (!R2_PUBLIC_BASE_URL) missing.push("R2_PUBLIC_BASE_URL");
  return missing;
}

// ================= R2 CLIENT =================
const s3 =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

function normalizeContentType(ct: string | null) {
  const c = (ct || "").toLowerCase();
  // sometimes browser sends multipart/form-data when using FormData
  if (!c || c.includes("multipart/form-data")) return "audio/mpeg";
  return ct || "audio/mpeg";
}

function extFromContentType(ct: string) {
  const c = ct.toLowerCase();
  if (c.includes("wav")) return "wav";
  if (c.includes("ogg")) return "ogg";
  if (c.includes("m4a") || c.includes("mp4")) return "m4a";
  return "mp3";
}

// ================= POST =================
export async function POST(req: NextRequest) {
  try {
    const missing = missingEnv();
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Missing env: ${missing.join(", ")}` },
        { status: 500 }
      );
    }
    if (!s3) {
      return NextResponse.json(
        { ok: false, error: "R2 client not initialized" },
        { status: 500 }
      );
    }

    const contentType = normalizeContentType(req.headers.get("content-type"));
    const audioBuffer = await req.arrayBuffer();

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      return NextResponse.json({ ok: false, error: "Empty audio body" }, { status: 400 });
    }

    const ext = extFromContentType(contentType);
    const key = `music/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: Buffer.from(audioBuffer),
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const publicUrl = `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;

    return NextResponse.json({
      ok: true,
      key,
      publicUrl,
    });
  } catch (err: any) {
    console.error("❌ R2 upload error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Upload failed",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
