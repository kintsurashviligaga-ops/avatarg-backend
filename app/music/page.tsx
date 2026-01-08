"use client";

import React, { useMemo, useRef, useState } from "react";

type MusicItem = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

export default function MusicPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [title, setTitle] = useState("Avatar G — Suno Track");
  const [style, setStyle] = useState("Upbeat, catchy, modern pop");
  const [lyrics, setLyrics] = useState("");

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [library, setLibrary] = useState<MusicItem[]>([]);
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);

  const nowPlaying = useMemo(() => {
    return library.find((x) => x.id === nowPlayingId) || null;
  }, [library, nowPlayingId]);

  const openSuno = () => {
    window.open("https://suno.com", "_blank", "noopener,noreferrer");
  };

  const pickFile = () => fileRef.current?.click();

  const stopAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  };

  const playItem = (id: string) => {
    const item = library.find((x) => x.id === id);
    if (!item) return;

    setNowPlayingId(id);

    // src შეცვლა => მერე play()
    window.setTimeout(() => {
      if (!audioRef.current) return;
      audioRef.current.src = item.url;
      audioRef.current.play().catch(() => {
        // ზოგჯერ ბრაუზერი არ უშვებს autoplay-ს; user click-ზე ჩვეულებრივ იმუშავებს
      });
    }, 0);
  };

  const togglePlay = (id: string) => {
    if (nowPlayingId !== id) return playItem(id);

    const a = audioRef.current;
    if (!a) return;

    if (a.paused) {
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  };

  const uploadFile = async (file: File) => {
    setError(null);

    // მარტივი ვალიდაცია
    const okType =
      file.type.includes("audio") ||
      file.name.toLowerCase().endsWith(".mp3") ||
      file.name.toLowerCase().endsWith(".wav");

    if (!okType) {
      setError("ატვირთე მხოლოდ MP3 ან WAV ფაილი.");
      return;
    }

    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("title", title || "AvatarG Track");
      form.append("file", file);

      const res = await fetch("/api/music/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Upload failed");
      }

      const item: MusicItem = {
        id: crypto.randomUUID(),
        title: title || file.name,
        url: data.url as string,
        createdAt: nowIso(),
      };

      setLibrary((prev) => [item, ...prev]);
      setNowPlayingId(item.id);

      // Auto play (თუ ბრაუზერი არ დაბლოკავს)
      window.setTimeout(() => {
        if (!audioRef.current) return;
        audioRef.current.src = item.url;
        audioRef.current.play().catch(() => {});
      }, 0);
    } catch (e: any) {
      setError(e?.message || "Upload error");
    } finally {
      setIsUploading(false);
      // input reset რომ იგივე ფაილი თავიდანაც აირჩიოს
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    await uploadFile(file);
  };

  const clearLibrary = () => {
    stopAudio();
    setNowPlayingId(null);
    setLibrary([]);
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.hTitle}>Music — Suno Integration</div>
            <div style={styles.hSub}>
              1) Suno-ში გენერირება → 2) MP3/WAV export → 3) აქ ატვირთვა (R2)
            </div>
          </div>

          <div style={styles.headerActions}>
            <button style={styles.ghostBtn} onClick={openSuno} type="button">
              Open Suno
            </button>
            <button
              style={styles.ghostBtn}
              onClick={clearLibrary}
              type="button"
              disabled={library.length === 0}
              title="Clear local list"
            >
              Clear
            </button>
          </div>
        </header>

        <section style={styles.card}>
          <div style={styles.grid}>
            <div style={styles.field}>
              <label style={styles.label}>Track Title</label>
              <input
                style={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Avatar G — Suno Track"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Style (Suno prompt)</label>
              <input
                style={styles.input}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="Upbeat, catchy, modern pop"
              />
            </div>
          </div>

          <div style={{ ...styles.field, marginTop: 12 }}>
            <label style={styles.label}>Lyrics (optional)</label>
            <textarea
              style={styles.textarea}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Paste lyrics here (optional)..."
            />
          </div>

          <div style={styles.actionsRow}>
            <input
              ref={fileRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,.mp3,.wav"
              onChange={onFileChange}
              style={{ display: "none" }}
            />

            <button
              style={styles.primaryBtn}
              onClick={pickFile}
              type="button"
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Upload MP3/WAV to R2"}
            </button>

            <div style={styles.hint}>
              Tip: Suno-ში “Export audio” → MP3/WAV → აქ ატვირთე.
            </div>
          </div>

          {error && <div style={styles.errorBox}>⚠️ {error}</div>}
        </section>

        <section style={styles.card}>
          <div style={styles.sectionTitle}>Library</div>

          {library.length === 0 ? (
            <div style={styles.empty}>
              ჯერ არაფერია. ატვირთე პირველი MP3/WAV და აქ გამოჩნდება.
            </div>
          ) : (
            <div style={styles.list}>
              {library.map((item) => {
                const isActive = item.id === nowPlayingId;
                return (
                  <div key={item.id} style={styles.row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.rowTitle}>
                        {item.title}
                        {isActive ? (
                          <span style={styles.badge}>NOW</span>
                        ) : null}
                      </div>
                      <div style={styles.rowMeta}>
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.link}
                      >
                        {item.url}
                      </a>
                    </div>

                    <div style={styles.rowActions}>
                      <button
                        style={styles.playBtn}
                        onClick={() => togglePlay(item.id)}
                        type="button"
                      >
                        {isActive && audioRef.current && !audioRef.current.paused
                          ? "Pause"
                          : "Play"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Hidden audio player */}
          <audio
            ref={audioRef}
            controls
            style={styles.audio}
            onEnded={() => {
              // დასრულებისას უბრალოდ paused იქნება
            }}
          />

          {nowPlaying && (
            <div style={styles.nowPlaying}>
              🎧 Now playing: <b>{nowPlaying.title}</b>
            </div>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.sectionTitle}>Suno Prompt Helper</div>
          <div style={styles.helperGrid}>
            <div style={styles.helperBox}>
              <div style={styles.helperLabel}>STYLE</div>
              <div style={styles.helperText}>{style || "-"}</div>
            </div>
            <div style={styles.helperBox}>
              <div style={styles.helperLabel}>TITLE</div>
              <div style={styles.helperText}>{title || "-"}</div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={styles.helperLabel}>LYRICS</div>
            <pre style={styles.pre}>{lyrics || "(empty)"}</pre>
          </div>
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 20% 0%, rgba(34,211,238,0.10), transparent 60%), radial-gradient(800px 500px at 90% 10%, rgba(59,130,246,0.10), transparent 55%), #05070b",
    color: "#e5e7eb",
    padding: 18,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
  },
  shell: {
    maxWidth: 920,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 4px",
  },
  hTitle: { fontSize: 22, fontWeight: 800, letterSpacing: 0.2 },
  hSub: { marginTop: 6, color: "#9ca3af", fontSize: 13, lineHeight: 1.4 },
  headerActions: { display: "flex", gap: 10, alignItems: "center" },

  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },

  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, color: "#9ca3af" },

  input: {
    height: 42,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.35)",
    color: "#e5e7eb",
    padding: "0 12px",
    outline: "none",
  },

  textarea: {
    minHeight: 110,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.35)",
    color: "#e5e7eb",
    padding: 12,
    outline: "none",
    resize: "vertical",
  },

  actionsRow: {
    marginTop: 12,
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },

  primaryBtn: {
    height: 42,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(34,211,238,0.45)",
    background:
      "linear-gradient(90deg, rgba(34,211,238,0.22), rgba(59,130,246,0.18))",
    color: "#e5e7eb",
    fontWeight: 700,
    cursor: "pointer",
  },

  ghostBtn: {
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: "#e5e7eb",
    cursor: "pointer",
  },

  hint: { color: "#9ca3af", fontSize: 12 },

  errorBox: {
    marginTop: 10,
    borderRadius: 12,
    padding: 10,
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.25)",
    color: "#fecaca",
    fontSize: 13,
  },

  sectionTitle: { fontWeight: 800, marginBottom: 10 },

  empty: { color: "#9ca3af", fontSize: 13, padding: "10px 2px" },

  list: { display: "flex", flexDirection: "column", gap: 10 },

  row: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.25)",
  },

  rowTitle: {
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  badge: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(34,211,238,0.35)",
    color: "#a5f3fc",
    background: "rgba(34,211,238,0.10)",
  },

  rowMeta: { color: "#9ca3af", fontSize: 12, marginTop: 4 },

  link: {
    display: "block",
    color: "#93c5fd",
    fontSize: 12,
    marginTop: 6,
    wordBreak: "break-all",
    textDecoration: "none",
  },

  rowActions: { display: "flex", gap: 8 },

  playBtn: {
    height: 38,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: "#e5e7eb",
    fontWeight: 700,
    cursor: "pointer",
    minWidth: 80,
  },

  audio: {
    width: "100%",
    marginTop: 12,
    borderRadius: 12,
    background: "rgba(0,0,0,0.25)",
  },

  nowPlaying: { marginTop: 10, color: "#a5f3fc", fontSize: 13 },

  helperGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  helperBox: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.22)",
    padding: 12,
  },

  helperLabel: { fontSize: 11, color: "#9ca3af", fontWeight: 800 },
  helperText: { marginTop: 6, fontWeight: 700 },

  pre: {
    marginTop: 6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.22)",
    padding: 12,
    color: "#e5e7eb",
    fontSize: 12,
    lineHeight: 1.5,
  },
};
