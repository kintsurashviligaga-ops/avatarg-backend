import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function getR2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2 env vars (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function safeExtFromContentType(contentType: string) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("audio/mpeg") || ct.includes("audio/mp3")) return "mp3";
  if (ct.includes("audio/wav")) return "wav";
  if (ct.includes("audio/ogg")) return "ogg";
  if (ct.includes("audio/mp4") || ct.includes("audio/aac")) return "m4a";
  return "mp3";
}

export async function POST(req: Request) {
  try {
    const bucket = process.env.R2_BUCKET;
    const publicBase = process.env.R2_PUBLIC_BASE_URL;

    if (!bucket) return jsonError("Missing R2_BUCKET", 500);
    if (!publicBase) return jsonError("Missing R2_PUBLIC_BASE_URL", 500);

    const r2 = getR2();
    const contentType = req.headers.get("content-type") || "";

    // ✅ Case A: multipart/form-data upload
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");

      if (!file || !(file instanceof File)) {
        return jsonError("Missing 'file' in form-data", 400);
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const ct = file.type || "audio/mpeg";
      const ext = safeExtFromContentType(ct);

      const key = `music/${crypto.randomUUID()}.${ext}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: ct,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );

      const url = `${publicBase.replace(/\/$/, "")}/${key}`;
      return NextResponse.json({ ok: true, key, url }, { status: 200 });
    }

    // ✅ Case B: raw bytes upload (send mp3 bytes directly)
    // Example: fetch('/api/music/upload', { method:'POST', headers:{'Content-Type':'audio/mpeg'}, body: audioBytes })
    const arrayBuffer = await req.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return jsonError("Empty body. Send multipart/form-data with file OR raw audio bytes.", 400);
    }

    const bytes = Buffer.from(arrayBuffer);
    const ct = contentType.includes("audio/") ? contentType : "audio/mpeg";
    const ext = safeExtFromContentType(ct);
    const key = `music/${crypto.randomUUID()}.${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: ct,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const url = `${publicBase.replace(/\/$/, "")}/${key}`;
    return NextResponse.json({ ok: true, key, url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Upload error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
