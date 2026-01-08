"use client";

import React, { useRef, useState } from "react";

type MusicItem = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
};

export default function MusicPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState("Avatar G — Suno Track");
  const [style, setStyle] = useState("Upbeat, catchy, modern pop");
  const [lyrics, setLyrics] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [library, setLibrary] = useState<MusicItem[]>([]);
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const openSuno = () => window.open("https://suno.com", "_blank", "noopener,noreferrer");

  const pickFile = () => fileRef.current?.click();

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title || file.name);
      fd.append("meta", JSON.stringify({ style, lyrics }));

      const res = await fetch("/api/music/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json(); // { url }
      const item: MusicItem = {
        id: crypto.randomUUID(),
        title: title || file.name,
        url: data.url,
        createdAt: new Date().toISOString(),
      };

      setLibrary((p) => [item, ...p]);
    } catch (e: any) {
      alert(`Upload error: ${e?.message || "unknown"}`);
    } finally {
      setIsUploading(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const ok =
      f.type.includes("audio") ||
      f.name.toLowerCase().endsWith(".mp3") ||
      f.name.toLowerCase().endsWith(".wav");

    if (!ok) {
      alert("Upload MP3 or WAV");
      e.target.value = "";
      return;
    }

    await uploadFile(f);
    e.target.value = "";
  };

  const togglePlay = (item: MusicItem) => {
    if (!audioRef.current) return;

    if (nowPlayingId === item.id) {
      audioRef.current.pause();
      setNowPlayingId(null);
      return;
    }

    audioRef.current.src = item.url;
    audioRef.current.play();
    setNowPlayingId(item.id);
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      alert("Copied ✅");
    } catch {
      alert("Copy failed (try long-press copy).");
    }
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>🎵 Music (Suno)</h1>
      <p style={{ opacity: 0.8, marginBottom: 14 }}>
        Generate in Suno → download MP3 → upload → get a permanent link.
      </p>

      <div style={card}>
        <label style={label}>
          <span style={lbl}>Title</span>
          <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label style={label}>
          <span style={lbl}>Style / Mood</span>
          <input style={input} value={style} onChange={(e) => setStyle(e.target.value)} />
        </label>

        <label style={label}>
          <span style={lbl}>Lyrics (optional)</span>
          <textarea style={{ ...input, minHeight: 120 }} value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={openSuno}>Open Suno</button>
          <button style={btnSecondary} onClick={pickFile} disabled={isUploading}>
            {isUploading ? "Uploading..." : "Upload MP3/WAV"}
          </button>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav" onChange={onFileChange} style={{ display: "none" }} />
        </div>
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>Library</h2>
          <span style={{ opacity: 0.7 }}>{library.length} tracks</span>
        </div>

        {library.length === 0 ? (
          <div style={{ opacity: 0.7, paddingTop: 10 }}>No tracks yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {library.map((t) => (
              <div key={t.id} style={itemCard}>
                <div>
                  <div style={{ fontWeight: 800 }}>{t.title}</div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>{new Date(t.createdAt).toLocaleString()}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button style={btnSmall} onClick={() => togglePlay(t)}>{nowPlayingId === t.id ? "Pause" : "Play"}</button>
                  <button style={btnSmall} onClick={() => copyUrl(t.url)}>Copy URL</button>
                  <a style={{ ...btnSmall, textDecoration: "none" }} href={t.url} target="_blank" rel="noreferrer">Open</a>
                </div>

                <div style={{ opacity: 0.75, fontSize: 12, wordBreak: "break-all", marginTop: 8 }}>{t.url}</div>
              </div>
            ))}
          </div>
        )}

        <audio ref={audioRef} controls style={{ width: "100%", marginTop: 12 }} onEnded={() => setNowPlayingId(null)} />
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  padding: 14,
};

const itemCard: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  padding: 12,
};

const label: React.CSSProperties = { display: "grid", gap: 6, marginBottom: 10 };
const lbl: React.CSSProperties = { fontSize: 13, opacity: 0.85 };

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(34,211,238,0.18)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
