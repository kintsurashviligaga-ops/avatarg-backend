"use client";

import { useEffect, useRef, useState } from "react";

type UploadJson = { url?: string; path?: string; error?: string };

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function base64ToUint8Array(base64: string) {
  // supports plain base64 or "data:audio/mpeg;base64,...."
  const clean = base64.includes(",") ? base64.split(",").pop()! : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function uploadToR2(
  audio: ArrayBuffer | Uint8Array | Blob,
  contentType = "audio/mpeg",
  signal?: AbortSignal
): Promise<string> {
  let body: BodyInit;

  if (audio instanceof Blob) {
    body = audio;
  } else if (audio instanceof Uint8Array) {
    body = new Blob([audio], { type: contentType });
  } else {
    body = new Blob([audio], { type: contentType });
  }

  const uploadRes = await fetch("/api/music/upload", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
    signal,
  });

  const uploadText = await uploadRes.text();
  const uploadJson = safeJsonParse(uploadText) as UploadJson | null;

  if (!uploadRes.ok) {
    throw new Error(
      `Upload failed (${uploadRes.status}): ${
        uploadJson?.error || uploadText || "Unknown upload error"
      }`
    );
  }

  const url = uploadJson?.url;
  if (!url) {
    throw new Error(`Upload response missing url: ${uploadText}`);
  }

  return url;
}

async function generateFinalSong(
  prompt: string,
  opts: { signal?: AbortSignal } = {}
): Promise<string> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Prompt is empty.");

  // 1) Compose music
  const composeRes = await fetch("/api/music/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: trimmed,
      music_length_ms: 30000,
      output_format: "mp3",
      model_id: "music_v1",
      force_instrumental: false,
    }),
    signal: opts.signal,
  });

  const ct = (composeRes.headers.get("content-type") || "").toLowerCase();

  // If not ok, read best error message
  if (!composeRes.ok) {
    const errText = await composeRes.text();
    const errJson = safeJsonParse(errText);
    throw new Error(
      `Compose failed (${composeRes.status}): ${
        errJson?.error || errJson?.message || errText || "Unknown error"
      }`
    );
  }

  // A) If backend returned audio bytes
  // Many servers return audio/* OR application/octet-stream
  if (ct.includes("audio/") || ct.includes("application/octet-stream")) {
    const audioBytes = await composeRes.arrayBuffer();
    return await uploadToR2(audioBytes, "audio/mpeg", opts.signal);
  }

  // B) Otherwise treat it as text/json
  const text = await composeRes.text();
  const json = safeJsonParse(text);

  // Some backends return direct url at top-level
  if (json?.url && typeof json.url === "string") return json.url;

  // Your current shape: { data: { url } }
  if (json?.data?.url && typeof json.data.url === "string") return json.data.url;

  // base64 shape: { data: { audio_base64, content_type } }
  if (json?.data?.audio_base64 && typeof json.data.audio_base64 === "string") {
    const bytes = base64ToUint8Array(json.data.audio_base64);
    const contentType =
      (json.data.content_type && String(json.data.content_type)) || "audio/mpeg";
    return await uploadToR2(bytes, contentType, opts.signal);
  }

  // if server actually returned something else (html/text)
  throw new Error(
    `Unknown compose response format. content-type=${ct}. body=${text?.slice(0, 300)}`
  );
}

export default function MusicPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // cleanup on unmount
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const onGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Please enter a prompt.");
      return;
    }

    // abort previous run if any
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      const url = await generateFinalSong(trimmed, {
        signal: abortRef.current.signal,
      });
      setAudioUrl(url);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // ignore abort
        return;
      }
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const onStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 680 }}>
      <h1 style={{ marginBottom: 10 }}>🎵 Avatar G — Music Generator</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Write a prompt (style, mood, instruments). Click Generate.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder='Example: "Upbeat New Year pop, bright synths, claps, 120bpm, happy vibe"'
        rows={5}
        style={{ width: "100%", marginBottom: 12, padding: 10 }}
        disabled={loading}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={onGenerate}
          disabled={loading || !prompt.trim()}
          style={{ padding: "10px 14px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Generating..." : "Generate Final Song"}
        </button>

        {loading && (
          <button
            onClick={onStop}
            style={{ padding: "10px 14px" }}
          >
            Stop
          </button>
        )}
      </div>

      {error && (
        <p style={{ color: "red", marginTop: 12, whiteSpace: "pre-wrap" }}>
          {error}
        </p>
      )}

      {audioUrl && (
        <div style={{ marginTop: 18 }}>
          <audio controls src={audioUrl} style={{ width: "100%" }} />
          <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
            <a href={audioUrl} target="_blank" rel="noreferrer">
              🔗 Open
            </a>
            <a href={audioUrl} download>
              ⬇ Download MP3
            </a>
          </div>
        </div>
      )}
    </div>
  );
                                       }
