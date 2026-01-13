"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Step = "idle" | "composing" | "uploading" | "done" | "error";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

async function safeReadText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeReadJson<T = any>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Base64 → Uint8Array (client-safe)
function base64ToUint8Array(b64: string) {
  const clean = String(b64 || "").replace(/^data:.*;base64,/, "").trim();
  if (!clean) return new Uint8Array();

  // atob exists in browsers; file is "use client"
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * ✅ CRITICAL FIX:
 * Always produce a REAL ArrayBuffer (not ArrayBufferLike / SharedArrayBuffer)
 */
function uint8ToSafeArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer; // <- always real ArrayBuffer
}

/**
 * ✅ Normalize any backend "audio" into Blob safely
 * Supports: Blob, ArrayBuffer, Uint8Array, base64 string, number[]
 * If string is URL -> throws "AUDIO_URL" marker
 */
function audioToBlobSafe(audio: any, contentType = "audio/mpeg"): Blob {
  if (!audio) throw new Error("No audio returned");

  if (audio instanceof Blob) return audio;

  if (audio instanceof ArrayBuffer) {
    return new Blob([audio], { type: contentType });
  }

  if (audio instanceof Uint8Array) {
    const ab = uint8ToSafeArrayBuffer(audio);
    return new Blob([ab], { type: contentType });
  }

  // Base64 string or URL
  if (typeof audio === "string") {
    const s = audio.trim();
    if (s.startsWith("http://") || s.startsWith("https://")) {
      throw new Error("AUDIO_URL");
    }
    const u8 = base64ToUint8Array(s);
    const ab = uint8ToSafeArrayBuffer(u8);
    return new Blob([ab], { type: contentType });
  }

  // number[] (JSON array of bytes)
  if (Array.isArray(audio) && audio.every((x) => typeof x === "number")) {
    const u8 = new Uint8Array(audio);
    const ab = uint8ToSafeArrayBuffer(u8);
    return new Blob([ab], { type: contentType });
  }

  throw new Error("Unsupported audio format");
}

type ComposeResponse = {
  audio?: any;
  audio_base64?: string;
  contentType?: string;
  filename?: string;
  url?: string;
  audio_url?: string;
} & Record<string, any>;

async function generateFinalSong(prompt: string): Promise<{
  blob: Blob;
  filename: string;
  contentType: string;
}> {
  const composeRes = await fetch("/api/music/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      music_length_ms: 30000,
      output_format: "mp3",
      model_id: "music_v1",
      force_instrumental: false,
    }),
  });

  if (!composeRes.ok) {
    const t = await safeReadText(composeRes);
    throw new Error(`Compose failed: ${composeRes.status}\n${t}`);
  }

  const ctHeader = composeRes.headers.get("content-type") || "";
  let contentType = "audio/mpeg";
  let filename = `avatar-g-${Date.now()}.mp3`;

  // Case A: backend returns raw audio binary
  if (!ctHeader.includes("application/json")) {
    const ab = await composeRes.arrayBuffer();
    contentType = ctHeader || "audio/mpeg";
    return {
      blob: new Blob([ab], { type: contentType }),
      filename,
      contentType,
    };
  }

  // Case B: backend returns JSON
  const data = (await safeReadJson<ComposeResponse>(composeRes)) || {};
  contentType = data.contentType || "audio/mpeg";
  filename = data.filename || filename;

  // If backend gives URL
  const url = data.url || data.audio_url;
  if (url && typeof url === "string") {
    const audioRes = await fetch(url);
    if (!audioRes.ok) {
      const t = await safeReadText(audioRes);
      throw new Error(`Fetch audio URL failed: ${audioRes.status}\n${t}`);
    }
    const ab = await audioRes.arrayBuffer();
    const ct2 = audioRes.headers.get("content-type");
    contentType = ct2 || contentType;
    return {
      blob: new Blob([ab], { type: contentType }),
      filename,
      contentType,
    };
  }

  // Try normal audio fields
  const audioAny = data.audio_base64 ?? data.audio ?? null;

  try {
    const blob = audioToBlobSafe(audioAny, contentType);
    return { blob, filename, contentType };
  } catch (e: any) {
    // URL marker fallback
    if (String(e?.message) === "AUDIO_URL" && typeof audioAny === "string") {
      const audioRes = await fetch(audioAny);
      if (!audioRes.ok) {
        const t = await safeReadText(audioRes);
        throw new Error(`Fetch audio URL failed: ${audioRes.status}\n${t}`);
      }
      const ab = await audioRes.arrayBuffer();
      const ct2 = audioRes.headers.get("content-type");
      contentType = ct2 || contentType;
      return {
        blob: new Blob([ab], { type: contentType }),
        filename,
        contentType,
      };
    }
    throw e;
  }
}

export default function MusicPage() {
  const [prompt, setPrompt] = useState(
    "Georgian New Year vibe, upbeat pop, festive, 120bpm, joyful chorus"
  );

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>("");

  const [audioUrl, setAudioUrl] = useState<string>("");
  const [publicUrl, setPublicUrl] = useState<string>("");
  const [downloadName, setDownloadName] = useState<string>("");

  const lastObjectUrlRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) {
        URL.revokeObjectURL(lastObjectUrlRef.current);
        lastObjectUrlRef.current = "";
      }
    };
  }, []);

  const canGenerate = useMemo(() => {
    const okPrompt = prompt.trim().length >= 6;
    const busy = step === "composing" || step === "uploading";
    return okPrompt && !busy;
  }, [prompt, step]);

  async function onGenerate() {
    setError("");
    setPublicUrl("");

    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = "";
    }
    setAudioUrl("");
    setDownloadName("");

    try {
      setStep("composing");

      const p = prompt.trim();
      const { blob, filename, contentType } = await generateFinalSong(p);

      const localUrl = URL.createObjectURL(blob);
      lastObjectUrlRef.current = localUrl;
      setAudioUrl(localUrl);
      setDownloadName(filename || `avatar-g-${Date.now()}.mp3`);

      setStep("uploading");

      const fd = new FormData();
      fd.append("file", blob, filename || `avatar-g-${Date.now()}.mp3`);
      fd.append("contentType", contentType);
      fd.append("prompt", p);

      const uploadRes = await fetch("/api/music/upload", {
        method: "POST",
        body: fd,
      });

      if (!uploadRes.ok) {
        const t = await safeReadText(uploadRes);
        setStep("done");
        setError(
          `Upload failed (but local preview works): ${uploadRes.status}\n${t}`
        );
        return;
      }

      const up = (await safeReadJson<any>(uploadRes)) || {};
      const url = up.publicUrl || up.url || up.fileUrl || "";
      if (url) setPublicUrl(url);

      setStep("done");
    } catch (e: any) {
      setStep("error");
      setError(e?.message ?? String(e));
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#0b1220] text-white">
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg sm:text-xl font-semibold">
              🎶 Music Generator
            </h1>
            <span
              className={cx(
                "text-xs px-2 py-1 rounded-full border",
                step === "idle" && "border-white/20 text-white/70",
                step === "composing" && "border-cyan-300/40 text-cyan-200",
                step === "uploading" && "border-amber-300/40 text-amber-200",
                step === "done" && "border-emerald-300/40 text-emerald-200",
                step === "error" && "border-red-300/40 text-red-200"
              )}
            >
              {step}
            </span>
          </div>

          <p className="mt-2 text-sm text-white/70">
            Prompt ჩაწერე და Generate. შემდეგ ფაილი აიტვირთება /api/music/upload-ზე
            (თუ upload route მუშაობს).
          </p>

          <div className="mt-4">
            <label className="text-xs text-white/60">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-cyan-400/40"
              placeholder="Describe the music…"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={onGenerate}
              disabled={!canGenerate}
              className={cx(
                "rounded-xl px-4 py-2 text-sm font-medium",
                canGenerate
                  ? "bg-cyan-500/90 hover:bg-cyan-400 text-black"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
              )}
            >
              Generate
            </button>

            {audioUrl && (
              <a
                href={audioUrl}
                download={downloadName || `avatar-g-${Date.now()}.mp3`}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                Download (local)
              </a>
            )}

            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/25"
              >
                Open uploaded file
              </a>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {audioUrl && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-white/60 mb-2">Preview</div>
              <audio controls className="w-full" src={audioUrl} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
