"use client";

import { useMemo, useState } from "react";

type Step = "idle" | "loading" | "done" | "error";

export default function MusicPage() {
  const [prompt, setPrompt] = useState(
    "Georgian New Year vibe, upbeat pop, festive, joyful chorus"
  );
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const canGenerate = useMemo(
    () => prompt.trim().length > 5 && step !== "loading",
    [prompt, step]
  );

  async function onGenerate() {
    setError("");
    setLyrics("");
    setAudioUrl(null);

    try {
      setStep("loading");

      const res = await fetch("/api/music/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          responseMode: "minimal", // 👈 სუფთა პასუხი, ზედმეტი JSON-ის გარეშე
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Request failed");
      }

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Generation failed");
      }

      setLyrics(data.lyrics || "");

      // ✅ აქ ვმუშაობთ მხოლოდ URL-ზე — NO Uint8Array, NO Blob hacks
      if (data.voice?.url) {
        setAudioUrl(data.voice.url);
      }

      setStep("done");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setStep("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold">🎵 Avatar G Music Generator</h1>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full rounded-xl bg-black/40 border border-white/10 p-3 text-sm"
          placeholder="Describe your song idea..."
        />

        <button
          disabled={!canGenerate}
          onClick={onGenerate}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${
            canGenerate
              ? "bg-cyan-500 text-black hover:bg-cyan-400"
              : "bg-white/10 text-white/40 cursor-not-allowed"
          }`}
        >
          {step === "loading" ? "Generating…" : "Generate"}
        </button>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-400/20 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {lyrics && (
          <div className="rounded-xl bg-black/30 border border-white/10 p-4 whitespace-pre-wrap text-sm">
            {lyrics}
          </div>
        )}

        {audioUrl && (
          <div className="rounded-xl bg-black/30 border border-white/10 p-4">
            <audio controls className="w-full" src={audioUrl} />
            <a
              href={audioUrl}
              download
              className="inline-block mt-2 text-xs text-cyan-300 hover:underline"
            >
              Download MP3
            </a>
          </div>
        )}
      </div>
    </div>
  );
                }
