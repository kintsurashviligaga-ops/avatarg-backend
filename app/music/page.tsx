"use client";

import { useRef, useState } from "react";

type MusicItem = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
};

export default function MusicPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [title, setTitle] = useState("Avatar G – Suno Track");
  const [style, setStyle] = useState("Upbeat, modern pop");
  const [lyrics, setLyrics] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [library, setLibrary] = useState<MusicItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);

  const API_BASE = "https://avatarg-backend.vercel.app";

  const pickFile = () => fileRef.current?.click();

  const uploadToR2 = async (file: File) => {
    setIsUploading(true);

    // 1️⃣ get presigned URL
    const signRes = await fetch(`${API_BASE}/api/r2/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
      }),
    });

    const { uploadUrl, publicUrl } = await signRes.json();

    // 2️⃣ upload directly to R2
    await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    // 3️⃣ save metadata in backend
    const saveRes = await fetch(`${API_BASE}/api/music/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        style,
        lyrics,
        fileUrl: publicUrl,
      }),
    });

    const saved = await saveRes.json();

    setLibrary((prev) => [saved.item, ...prev]);
    setIsUploading(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>🎵 Music (Suno)</h1>

      <input
        placeholder="Track title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        placeholder="Style"
        value={style}
        onChange={(e) => setStyle(e.target.value)}
      />

      <textarea
        placeholder="Lyrics (optional)"
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
      />

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadToR2(f);
        }}
      />

      <button onClick={pickFile} disabled={isUploading}>
        {isUploading ? "Uploading..." : "Upload Suno MP3"}
      </button>

      <hr />

      <h2>Library</h2>

      {library.map((m) => (
        <div key={m.id}>
          <strong>{m.title}</strong>
          <button
            onClick={() => {
              setNowPlaying(m.url);
              setTimeout(() => audioRef.current?.play(), 100);
            }}
          >
            ▶ Play
          </button>
        </div>
      ))}

      <audio ref={audioRef} src={nowPlaying ?? undefined} controls />
    </div>
  );
}
