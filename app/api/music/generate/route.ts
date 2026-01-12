"use client";

import React, { useMemo, useState } from "react";

type ApiOkMinimal = {
  ok: true;
  title: string;
  bpm: number;
  lyrics: string;
  voice: {
    provider: "elevenlabs";
    voiceId: string;
    url: string | null;
  };
};

type ApiOkFull = {
  ok: true;
  title: string;
  bpm: number;
  lyrics: string;
  tts_text?: string;
  voice: {
    provider: "elevenlabs";
    voiceId: string;
    url: string | null;
    storagePath?: string | null;
    bytes?: number;
    contentType?: "audio/mpeg";
  };
  note?: string;
};

type ApiErr = {
  ok: false;
  error: string;
  code?: string;
};

type ApiResponse = ApiOkMinimal | ApiOkFull | ApiErr;

function prettyError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e ?? "Unknown error");
}

function extractLyricsClean(maybeLyrics: unknown): string {
  const s = String(maybeLyrics ?? "").trim();

  // already clean
  if (!s.startsWith("{") && !s.includes('"choices"') && !s.includes('"usage"')) return s;

  // try parse envelope
  try {
    const obj = JSON.parse(s);
    if (typeof obj?.lyrics === "string" && obj.lyrics.trim()) return obj.lyrics.trim();
    const content = obj?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
  } catch {
    // ignore
  }

  return s;
}

export default function MusicPage() {
  const [mood, setMood] = useState("Happy / festive");
  const [language, setLanguage] = useState("English");
  const [genre, setGenre] = useState("R&B / Soul");
  const [topic, setTopic] = useState("Avatar G platform promo");
  const [mustInclude, setMustInclude] = useState("New Year vibe, business CTA, Tbilisi");
  const [bpm, setBpm] = useState<number>(120);

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState<string>("");
  const [lyrics, setLyrics] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");

  const canPlay = useMemo(() => Boolean(audioUrl), [audioUrl]);

  async function onGenerate() {
    setLoading(true);
    setError("");
    setTitle("");
    setLyrics("");
    setAudioUrl(null);
    setNote("");

    try {
      const res = await fetch("/api/music/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mood,
          genre,
          language,
          topic,
          mustInclude,
          bpm,
          responseMode: "full",
        }),
      });

      const data = (await res.json()) as ApiResponse;

      if (!data || data.ok !== true) {
        const msg = (data as ApiErr)?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      setTitle(data.title ?? "");
      setLyrics(extractLyricsClean(data.lyrics));
      setNote((data as ApiOkFull).note ?? "");

      // ✅ IMPORTANT: Use ONLY URL. No Blob / no Uint8Array.
      const url = data.voice?.url ?? null;
      setAudioUrl(url);

      if (!url) {
        setNote(
          (data as ApiOkFull).note ||
            "Audio URL is null. Configure Supabase Storage (public bucket) so backend can return a public URL."
        );
      }
    } catch (e) {
      setError(prettyError(e));
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="text-lg font-semibold">Music Prompt Builder</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs opacity-70">Mood</div>
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs opacity-70">Language</div>
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs opacity-70">Genre</div>
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs opacity-70">BPM</div>
            <input
              type="number"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value || 120))}
              min={60}
              max={200}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <div className="text-xs opacity-70">Topic</div>
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <div className="text-xs opacity-70">Must include</div>
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              value={mustInclude}
              onChange={(e) => setMustInclude(e.target.value)}
            />
          </label>
        </div>

        <button
          onClick={onGenerate}
          disabled={loading}
          className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 px-4 py-2 font-medium"
        >
          {loading ? "Generating..." : "Generate"}
        </button>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
            <div className="font-semibold text-red-200">Error</div>
            <div className="text-red-100/90">{error}</div>
          </div>
        )}

        {note && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm opacity-90">
            {note}
          </div>
        )}
      </div>

      {(title || lyrics || canPlay) && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
          {title && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-semibold">{title}</div>
              <div className="text-xs opacity-70">{bpm} BPM</div>
            </div>
          )}

          {lyrics && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => copy(lyrics)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm hover:bg-black/40"
                >
                  Copy Lyrics
                </button>
              </div>

              <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-sm leading-relaxed">
                {lyrics}
              </pre>
            </div>
          )}

          {/* ✅ Audio player uses ONLY URL */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Vocal MP3</div>
            {audioUrl ? (
              <audio src={audioUrl} controls className="w-full" preload="none" />
            ) : (
              <div className="text-sm opacity-70">
                Audio URL is not available. (Set Supabase Storage public bucket + env vars on backend)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
                }
