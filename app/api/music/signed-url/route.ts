import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const { key, contentType } = await req.json();

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "Missing 'key' (string)" }, { status: 400 });
    }

    const R2_ENDPOINT = required("R2_ENDPOINT");
    const R2_ACCESS_KEY_ID = required("R2_ACCESS_KEY_ID");
    const R2_SECRET_ACCESS_KEY = required("R2_SECRET_ACCESS_KEY");
    const R2_BUCKET_NAME = required("R2_BUCKET_NAME");

    const s3 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
