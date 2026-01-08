import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // NOTE: ეს არის დროებითი stub. მოგვიანებით R2/S3-ზე ავტვირთავთ რეალურად.
  const form = await req.formData();
  const title = String(form.get("title") || "Untitled");
  const file = form.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  // დროებით: უბრალოდ ვაბრუნებთ “fake” url-ს (სისტემა არ ჩამოიშლება).
  // რეალურ ინტეგრაციაში აქ ატვირთვა იქნება R2/S3-ზე და დაბრუნდება რეალური public URL.
  const url = `https://example.com/${encodeURIComponent(title)}.mp3`;

  return NextResponse.json({ url });
}
