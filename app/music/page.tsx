"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Track = {
  id: string;
  title: string;
  style: string;
  lyrics: string;
  audioUrl: string;
  createdAt: string;
};

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function MusicPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [title, setTitle] = useState("Avatar G – Suno Track");
  const [style, setStyle] = useState("Upbeat, catchy, modern pop");
  const [language, setLanguage] = useState<"English" | "Georgian" | "Russian">("English");
  const [mood, setMood] = useState("Happy, uplifting, confident");
  const [theme, setTheme] = useState("Avatar G app advertisement, futuristic, premium");

  const [lyrics, setLyrics] = useState("");
  const [sunoPrompt, setSunoPrompt] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const canUpload = useMemo(() => title.trim().length > 0 && style.trim().length > 0 && lyrics.trim().length > 0, [
    title,
    style,
    lyrics,
  ]);

  async function loadLibrary() {
    try {
      const res = await fetch("/api/music/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setTracks(data.tracks || []);
    } catch (e: any) {
      setStatus(`Library load error: ${e?.message || "unknown"}`);
    }
  }

  useEffect(() => {
    loadLibrary();
  }, []);

  const openSuno = () => window.open("https://suno.com", "_blank", "noopener,noreferrer");
  const pickFile = () => fileRef.current?.click();

  async function generateSunoPack() {
    setIsGenerating(true);
    setStatus("");
    try {
      const res = await fetch("/api/ai/suno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          style,
          language,
          mood,
          theme,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Generate failed");

      setLyrics(data.lyrics || "");
      setSunoPrompt(data.sunoPrompt || "");
      setStatus("✅ Generated Suno-ready lyrics + prompt.");
    } catch (e: any) {
      setStatus(`❌ Generate error: ${e?.message || "unknown"}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function uploadMp3(file: File) {
    if (!canUpload) {
      setStatus("❌ Fill Title / Style / Lyrics first (or click Generate).");
      return;
    }

    // accept mp3/wav/m4a for flexibility
    const okTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/aac"];
    if (!okTypes.includes(file.type) && !file.name.toLowerCase().match(/\.(mp3|wav|m4a|aac)$/)) {
      setStatus("❌ Please upload an audio file (mp3/wav/m4a/aac).");
      return;
    }

    setIsUploading(true);
    setStatus("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("style", style);
      fd.append("lyrics", lyrics);

      const res = await fetch("/api/music/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");

      setStatus("✅ Uploaded + saved to library.");
      await loadLibrary();

      // autoplay the newest
      if (data?.track?.audioUrl && audioRef.current) {
        audioRef.current.src = data.track.audioUrl;
        audioRef.current.play().catch(() => {});
        setNowPlayingId(data.track.id);
      }
    } catch (e: any) {
      setStatus(`❌ Upload error: ${e?.message || "unknown"}`);
    } finally {
      setIsUploading(false);
    }
  }

  function playTrack(t: Track) {
    if (!audioRef.current) return;
    audioRef.current.src = t.audioUrl;
    audioRef.current.play().catch(() => {});
    setNowPlayingId(t.id);
  }

  function stop() {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setNowPlayingId(null);
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>🎵 Music – Suno Integration</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Generate Suno-ready lyrics + prompt, then upload your final audio and keep a library in Supabase.
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr" }}>
        {/* Controls */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            padding: 14,
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track title"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Style</label>
              <input
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="Upbeat pop, cinematic, trap..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                }}
              >
                <option value="English">English</option>
                <option value="Georgian">Georgian</option>
                <option value="Russian">Russian</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Mood</label>
              <input
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="Happy, emotional, energetic..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>Theme / Brief</label>
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="What the song is about..."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button
              onClick={generateSunoPack}
              disabled={isGenerating}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: isGenerating ? "rgba(0,0,0,0.35)" : "rgba(0,160,255,0.25)",
                color: "white",
                cursor: isGenerating ? "not-allowed" : "pointer",
              }}
            >
              {isGenerating ? "Generating..." : "✨ Generate Suno Pack"}
            </button>

            <button
              onClick={openSuno}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
              }}
            >
              Open Suno
            </button>

            <button
              onClick={pickFile}
              disabled={isUploading}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: isUploading ? "rgba(0,0,0,0.35)" : "rgba(0,255,170,0.18)",
                color: "white",
                cursor: isUploading ? "not-allowed" : "pointer",
              }}
            >
              {isUploading ? "Uploading..." : "⬆️ Upload Audio"}
            </button>

            <button
              onClick={loadLibrary}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
              }}
            >
              ↻ Refresh Library
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMp3(f);
                e.currentTarget.value = "";
              }}
            />
          </div>

          {status && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(0,0,0,0.25)" }}>
              <div style={{ fontSize: 13, opacity: 0.95 }}>{status}</div>
            </div>
          )}
        </div>

        {/* Lyrics + Prompt */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 14,
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <h3 style={{ margin: 0 }}>📝 Lyrics (Suno-ready)</h3>
              <button
                onClick={() => navigator.clipboard.writeText(lyrics || "")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>

            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Generate or paste lyrics here..."
              rows={14}
              style={{
                width: "100%",
                marginTop: 10,
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
                resize: "vertical",
              }}
            />
          </div>

          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 14,
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <h3 style={{ margin: 0 }}>🎛️ Suno Prompt</h3>
              <button
                onClick={() => navigator.clipboard.writeText(sunoPrompt || "")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>

            <textarea
              value={sunoPrompt}
              onChange={(e) => setSunoPrompt(e.target.value)}
              placeholder="Suno prompt will appear here..."
              rows={14}
              style={{
                width: "100%",
                marginTop: 10,
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
                resize: "vertical",
              }}
            />
          </div>
        </div>

        {/* Player + Library */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            padding: 14,
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h3 style={{ margin: 0 }}>📚 Library</h3>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={stop}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Stop
              </button>
            </div>
          </div>

          <audio ref={audioRef} controls style={{ width: "100%", marginTop: 10 }} />

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {tracks.length === 0 ? (
              <div style={{ opacity: 0.8 }}>No tracks yet. Generate → create on Suno → upload audio.</div>
            ) : (
              tracks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 12,
                    padding: 12,
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{t.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{t.style}</div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>{fmtDate(t.createdAt)}</div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button
                        onClick={() => playTrack(t)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: nowPlayingId === t.id ? "rgba(0,160,255,0.25)" : "rgba(255,255,255,0.06)",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        ▶ Play
                      </button>

                      <a
                        href={t.audioUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "white", opacity: 0.85, textDecoration: "underline" }}
                      >
                        Open audio
                      </a>
                    </div>
                  </div>

                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", opacity: 0.9 }}>Lyrics</summary>
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, opacity: 0.9 }}>{t.lyrics}</pre>
                  </details>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
  }
