"use client";

import { useMemo, useState } from "react";

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

async function safeReadJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function generateFinalSong(prompt: string): Promise<string> {
  // 1) Compose
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
    const text = await safeReadText(composeRes);
    const json = await safeReadJson(composeRes);
    throw new Error(
      `Compose failed (HTTP ${composeRes.status}). ${
        json?.error ? `Error: ${json.error}` : ""
      }\n${text?.slice(0, 1200) || ""}`.trim()
    );
  }

  const ct = (composeRes.headers.get("content-type") || "").toLowerCase();

  // A) If backend returns bytes (audio)
  if (ct.includes("audio/") || ct.includes("application/octet-stream")) {
    const audioBytes = await composeRes.arrayBuffer();

    // 2) Upload
    const uploadRes = await fetch("/api/music/upload", {
      method: "POST",
      headers: { "Content-Type": "audio/mpeg" },
      body: audioBytes,
    });

    if (!uploadRes.ok) {
      const text = await safeReadText(uploadRes);
      const json = await safeReadJson(uploadRes);
      throw new Error(
        `Upload failed (HTTP ${uploadRes.status}). ${
          json?.error ? `Error: ${json.error}` : ""
        }\n${text?.slice(0, 1200) || ""}`.trim()
      );
    }

    const data = await uploadRes.json();
    if (!data?.url) throw new Error("Upload success but no url returned");
    return String(data.url);
  }

  // B) If backend returns JSON
  const json = await composeRes.json();

  // If provider already returns a URL
  if (json?.data?.url) return String(json.data.url);

  // If provider returns base64 audio
  if (json?.data?.audio_base64) {
    const bytes = Uint8Array.from(atob(json.data.audio_base64), (c) =>
      c.charCodeAt(0)
    );

    const uploadRes = await fetch("/api/music/upload", {
      method: "POST",
      headers: { "Content-Type": json?.data?.content_type || "audio/mpeg" },
      body: bytes,
    });

    if (!uploadRes.ok) {
      const text = await safeReadText(uploadRes);
      const j = await safeReadJson(uploadRes);
      throw new Error(
        `Upload failed (HTTP ${uploadRes.status}). ${
          j?.error ? `Error: ${j.error}` : ""
        }\n${text?.slice(0, 1200) || ""}`.trim()
      );
    }

    const data = await uploadRes.json();
    if (!data?.url) throw new Error("Upload success but no url returned");
    return String(data.url);
  }

  throw new Error(
    "Unknown compose response format. Expected audio bytes or JSON {data.url|data.audio_base64}"
  );
}

export default function MusicPage() {
  const [prompt, setPrompt] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = useMemo(() => prompt.trim().length >= 6 && step !== "composing" && step !== "uploading", [prompt, step]);

  const onGenerate = async () => {
    setError(null);
    setAudioUrl(null);

    try {
      setStep("composing");
      const url = await generateFinalSong(prompt.trim());
      setAudioUrl(url);
      setStep("done");
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setStep("error");
    }
  };

  const onCopy = async () => {
    if (!audioUrl) return;
    try {
      await navigator.clipboard.writeText(audioUrl);
      alert("✅ Link copied");
    } catch {
      alert("❌ Copy failed (browser permission).");
    }
  };

  return (
    <div className="min-h-[calc(100vh-40px)] w-full px-5 py-8 flex justify-center">
      <div className="w-full max-w-[860px]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 shadow-[0_18px_60px_rgba(0,0,0,.45)] backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 border border-white/15" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white/90">🎵 Avatar G — Music Generator</h1>
              <p className="text-sm text-white/65">Prompt → Compose → Upload → Final MP3</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <label className="text-xs text-white/70">Song Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: Georgian New Year vibe, upbeat pop, festive, 120bpm, joyful chorus..."
                rows={4}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-white/90 outline-none focus:border-cyan-400/50 focus:ring-4 focus:ring-cyan-400/15"
              />
              <div className="mt-2 text-xs text-white/55">
                მინ. 6 სიმბოლო. რეკომენდაცია: ჟანრი + ტემპი + ვაიბი + ინსტრუმენტები.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-10">
              <button
                onClick={onGenerate}
                disabled={!canGenerate}
                className={cx(
                  "rounded-2xl px-4 py-3 font-bold border border-white/15 shadow-[0_12px_30px_rgba(34,211,238,.18)]",
                  canGenerate
                    ? "bg-gradient-to-r from-cyan-300 to-blue-400 text-[#041018] active:translate-y-[1px]"
                    : "bg-white/10 text-white/50 cursor-not-allowed"
                )}
              >
                {step === "composing" || step === "uploading" ? "Generating..." : "Generate Final MP3"}
              </button>

              <div className="text-sm text-white/70">
                Status:{" "}
                <span className={cx(
                  "font-semibold",
                  step === "done" && "text-emerald-300",
                  step === "error" && "text-red-300",
                  (step === "composing" || step === "uploading") && "text-cyan-200"
                )}>
                  {step === "idle" && "idle"}
                  {step === "composing" && "composing…"}
                  {step === "uploading" && "uploading…"}
                  {step === "done" && "done ✓"}
                  {step === "error" && "error"}
                </span>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100 whitespace-pre-wrap">
                <b>❌ Error:</b>
                <div className="mt-2">{error}</div>
              </div>
            )}

            {audioUrl && (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                <div className="text-sm text-white/85 font-semibold">✅ Final MP3 ready</div>

                <audio className="mt-3 w-full" controls src={audioUrl} />

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={audioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/85"
                  >
                    Open
                  </a>

                  <button
                    onClick={onCopy}
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/85"
                  >
                    Copy link
                  </button>

                  <a
                    href={audioUrl}
                    download
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/85"
                  >
                    ⬇ Download MP3
                  </a>
                </div>

                <div className="mt-2 text-xs text-white/60 break-all">{audioUrl}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
