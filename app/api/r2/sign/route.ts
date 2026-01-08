import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs"; // AWS SDK works best on node runtime

// Required env vars in Vercel / .env
// R2_ACCESS_KEY_ID
// R2_SECRET_ACCESS_KEY
// R2_BUCKET_NAME
// R2_ENDPOINT  -> https://<ACCOUNT_ID>.r2.cloudflarestorage.com

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getS3Client() {
  const endpoint = mustGetEnv("R2_ENDPOINT");
  const accessKeyId = mustGetEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = mustGetEnv("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function sanitizeFolder(folder: string) {
  // keep simple safe path: letters, numbers, -, _, /
  const cleaned = folder
    .trim()
    .replace(/^\//, "")
    .replace(/\/+$/, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "");

  return cleaned || "uploads";
}

function inferExt(fileName?: string, contentType?: string) {
  const fromName = fileName?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;

  // minimal fallback map
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("quicktime")) return "mov";
  if (ct.includes("mpeg")) return "mp3";
  if (ct.includes("wav")) return "wav";
  if (ct.includes("pdf")) return "pdf";

  return "bin";
}

function makeKey(folder: string, ext: string) {
  const yyyy = new Date().getFullYear();
  const mm = String(new Date().getMonth() + 1).padStart(2, "0");

  // simple uuid without extra deps
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${folder}/${yyyy}-${mm}/${rnd}.${ext}`;
}

export async function POST(req: Request) {
  try {
    const bucket = mustGetEnv("R2_BUCKET_NAME");
    const s3 = getS3Client();

    const body = await req.json().catch(() => ({}));

    const contentType: string =
      body?.contentType || "application/octet-stream";

    const folder: string = sanitizeFolder(body?.folder || "uploads");
    const fileName: string | undefined = body?.fileName;

    const ext = inferExt(fileName, contentType);
    const key = makeKey(folder, ext);

    // Optional limits (you can adjust)
    // If you want to restrict types, do it here:
    // const allowed = ["image/", "video/", "audio/", "application/pdf"];
    // if (!allowed.some((p) => contentType.startsWith(p))) { ... }

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      // You can add metadata if you want:
      // Metadata: { uploadedBy: "avatarg" },
    });

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 * 5 }); // 5 minutes

    return NextResponse.json({
      ok: true,
      uploadUrl,
      key,
      bucket,
      contentType,
      expiresIn: 300,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "sign error" },
      { status: 500 }
    );
  }
      }
