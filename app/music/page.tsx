"use client";

import { useState } from "react";

async function generateFinalSong(prompt: string): Promise<string> {
  // 1) Compose music
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
    const err = await composeRes.text();
    throw new Error("Compose failed: " + err);
  }

  const ct = composeRes.headers.get("content-type") || "";

  // A) If backend returned audio bytes
  if (ct.includes("audio/") || ct.includes("application/octet-stream")) {
    const audioBytes = await composeRes.arrayBuffer();

    // 2) Upload to R2
    const uploadRes = await fetch("/api/music/upload", {
      method: "POST",
      headers: { "Content-Type": "audio/mpeg" },
      body: audioBytes,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error("Upload failed: " + err);
    }

    const data = await uploadRes.json();
    return data.url as string;
  }

  // B) If backend returned JSON
  const json = await composeRes.json();

  if (json?.data?.url) return json.data.url;

  if (json?.data?.audio_base64) {
    const bytes = Uint8Array.from(
      atob(json.data.audio_base64),
      (c) => c.charCodeAt(0)
    );

    const uploadRes = await fetch("/api/music/upload", {
      method: "POST",
      headers: { "Content-Type": json.data.content_type || "audio/mpeg" },
      body: bytes,
    });

    const data = await uploadRes.json();
    return data.url;
  }

  throw new Error("Unknown response format");
}

export default function MusicPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = async () => {
    setLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      const url = await generateFinalSong(prompt);
      setAudioUrl(url);
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h1>🎵 Avatar G – Generate Final Song</h1>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your song (style, mood, vibe...)"
        rows={4}
        style={{ width: "100%", marginBottom: 12 }}
      />

      <button onClick={onGenerate} disabled={loading || !prompt}>
        {loading ? "Generating..." : "Generate Final Song"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {audioUrl && (
        <div style={{ marginTop: 20 }}>
          <audio controls src={audioUrl} />
          <br />
          <a href={audioUrl} download>
            ⬇ Download MP3
          </a>
        </div>
      )}
    </div>
  );
}
