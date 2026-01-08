import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeSlug(input: string) {
  return (input || "track")
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function getExt(filename: string, mime: string) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".mp3")) return "mp3";
  if (lower.endsWith(".wav")) return "wav";
  if (mime?.includes("mpeg")) return "mp3";
  if (mime?.includes("wav")) return "wav";
  return "mp3";
}

export async function POST(req: Request) {
  try {
    const accountId = process.env.R2_ACCOUNT_ID!;
    const bucket = process.env.R2_BUCKET!;
    const publicBase = process.env.R2_PUBLIC_BASE_URL!;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

    if (!accountId || !bucket || !publicBase || !accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        { error: "Missing R2 env vars" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const title = String(form.get("title") || "AvatarG Track");
    const file = form.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const mime = file.type || "audio/mpeg";
    const ext = getExt(file.name, mime);

    // ⚠️ Vercel-ის request size ლიმიტი შეიძლება დაგარტყას დიდ MP3-ზე.
    // თუ upload-ზე error გექნება, შემდეგ ეტაპზე გადავიყვანთ Presigned URL-ზე (საუკეთესო გზა).
    const buf = Buffer.from(await file.arrayBuffer());

    const key = `music/${Date.now()}-${safeSlug(title)}.${ext}`;

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buf,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const url = `${publicBase.replace(/\/$/, "")}/${key}`;

    return NextResponse.json({ ok: true, key, url });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
