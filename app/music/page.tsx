"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Step = "idle" | "starting" | "waiting" | "done" | "error";

type MusicResult = {
  id: string;
  status: "queued" | "processing" | "done" | "error" | string;

  // ✅ preferred: same-origin proxy (/api/music/file?path=...)
  fileUrl?: string | null;

  // debug fields
  publicUrl?: string | null;
  public_url?: string | null;
  url?: string | null;

  filename?: string | null;
  errorMessage?: string | null;
  updatedAt?: string | null;
};

type StatusResponse = {
  ok: boolean;
  result?: MusicResult;
  error?: string;
};

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeJson<T = any>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * ✅ STRICT:
 * Only use fileUrl (same-origin proxy). NO fallback.
 * If fileUrl is missing -> show error instead of trying publicUrl.
 */
function pickBestRemoteUrl(result?: MusicResult): string {
  if (!result?.fileUrl) return "";
  return result.fileUrl;
}

function pickDebugPublicUrl(result?: MusicResult): string {
  return result?.publicUrl || result?.public_url || result?.url || "";
}

function pickFilename(result?: MusicResult): string {
  const name = result?.filename?.trim();
  if (name) return name;
  return `avatar-g-${Date.now()}.mp3`;
}

/**
 * Fetch mp3 and convert to Blob URL.
 * ✅ For /api/music/file we are same-origin, so no CORS pain.
 */
async function fetchToBlobUrl(remoteUrl: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(remoteUrl, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!res.ok) {
    const t = await safeText(res);
    throw new Error(`Audio fetch failed: ${res.status}\n${t || ""}`);
  }

  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error("Audio fetch returned empty blob");

  return URL.createObjectURL(blob);
}

export default function MusicPage() {
  const [prompt, setPrompt] = useState(
    "Georgian New Year vibe, upbeat pop, festive, 120bpm, joyful chorus"
  );

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>("");

  const [jobId, setJobId] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");

  // ✅ fileUrl proxy for play/download
  const [remoteUrl, setRemoteUrl] = useState<string>("");

  // optional debug URL (supabase public url)
  const [debugUrl, setDebugUrl] = useState<string>("");

  // playableUrl is Blob URL (blob:...)
  const [playableUrl, setPlayableUrl] = useState<string>("");

  const [filename, setFilename] = useState<string>("");

  // separate controllers: one for job flow, one for audio fetching
  const jobAbortRef = useRef<AbortController | null>(null);
  const audioAbortRef = useRef<AbortController | null>(null);

  const pollingRef = useRef<number | null>(null);

  // track current blob url for cleanup
  const blobUrlRef = useRef<string>("");

  useEffect(() => {
    return () => {
      jobAbortRef.current?.abort();
      audioAbortRef.current?.abort();

      if (pollingRef.current) window.clearInterval(pollingRef.current);
      pollingRef.current = null;

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = "";
      }
    };
  }, []);

  const canGenerate = useMemo(() => {
    const okPrompt = prompt.trim().length >= 6;
    const busy = step === "starting" || step === "waiting";
    return okPrompt && !busy;
  }, [prompt, step]);

  function stopPolling() {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function cleanupBlob() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = "";
    }
    setPlayableUrl("");
  }

  async function startJob(p: string): Promise<string> {
    const res = await fetch("/api/music/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: p,
        music_length_ms: 30000,
        output_format: "mp3",
        model_id: "music_v1",
        force_instrumental: false,
      }),
      signal: jobAbortRef.current?.signal,
    });

    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`Generate failed: ${res.status}\n${t}`);
    }

    const data = (await safeJson<any>(res)) || {};
    const id = data.jobId || data.id || data?.result?.jobId || data?.result?.id || "";

    if (!id || typeof id !== "string") {
      throw new Error(`Generate response missing jobId. Got: ${JSON.stringify(data).slice(0, 500)}`);
    }

    return id;
  }

  async function fetchStatus(id: string): Promise<StatusResponse> {
    const res = await fetch(`/api/music/status?id=${encodeURIComponent(id)}`, {
      method: "GET",
      signal: jobAbortRef.current?.signal,
      cache: "no-store",
    });

    const data = (await safeJson<StatusResponse>(res)) || null;

    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`Status failed: ${res.status}\n${data?.error || t || "Unknown error"}`);
    }

    if (!data) throw new Error("Status returned invalid JSON");
    return data;
  }

  async function setFinalResult(result?: MusicResult) {
    const url = pickBestRemoteUrl(result);
    if (!url) {
      // STRICT: we do NOT fallback to publicUrl
      throw new Error("Missing result.fileUrl. Backend must return fileUrl from /api/music/status.");
    }

    setRemoteUrl(url);
    setDebugUrl(pickDebugPublicUrl(result));
    setFilename(pickFilename(result));

    cleanupBlob();
  }

  async function ensurePlayableBlob() {
    if (playableUrl) return playableUrl;
    if (!remoteUrl) throw new Error("Missing fileUrl (remoteUrl)");

    // abort only previous AUDIO fetch, not the whole job flow
    audioAbortRef.current?.abort();
    audioAbortRef.current = new AbortController();

    cleanupBlob();

    const blobUrl = await fetchToBlobUrl(remoteUrl, audioAbortRef.current.signal);
    blobUrlRef.current = blobUrl;
    setPlayableUrl(blobUrl);

    return blobUrl;
  }

  async function onGenerate() {
    setError("");
    setRemoteUrl("");
    setDebugUrl("");
    setFilename("");
    setJobId("");
    setStatusText("");
    cleanupBlob();

    // abort previous job flow + polling
    jobAbortRef.current?.abort();
    jobAbortRef.current = new AbortController();
    stopPolling();

    // abort any audio fetch too
    audioAbortRef.current?.abort();
    audioAbortRef.current = null;

    try {
      setStep("starting");

      const p = prompt.trim();
      const id = await startJob(p);
      setJobId(id);

      setStep("waiting");
      setStatusText("queued");

      // First check
      const first = await fetchStatus(id);
      const st = first.result?.status || "queued";
      setStatusText(st);

      if (st === "done") {
        await setFinalResult(first.result);
        setStep("done");
        return;
      }

      if (st === "error") {
        throw new Error(first.result?.errorMessage || first.error || "Music job failed");
      }

      // Poll
      pollingRef.current = window.setInterval(async () => {
        try {
          const s = await fetchStatus(id);
          const status = s.result?.status || "queued";
          setStatusText(status);

          if (status === "done") {
            stopPolling();
            await setFinalResult(s.result);
            setStep("done");
          } else if (status === "error") {
            stopPolling();
            setStep("error");
            setError(s.result?.errorMessage || s.error || "Music job failed");
          }
        } catch (e: any) {
          if (e?.name === "AbortError") return;
          stopPolling();
          setStep("error");
          setError(e?.message ?? String(e));
        }
      }, 2000);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setStep("error");
      setError(e?.message ?? String(e));
    }
  }

  function onStop() {
    jobAbortRef.current?.abort();
    stopPolling();
    setStep("idle");
    setStatusText("");
  }

  async function onPreparePlay() {
    setError("");
    try {
      await ensurePlayableBlob();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function onDownload() {
    setError("");
    try {
      const blobUrl = await ensurePlayableBlob();

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || `avatar-g-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#0b1220] text-white">
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg sm:text-xl font-semibold">🎶 Music Generator</h1>

            <span
              className={cx(
                "text-xs px-2 py-1 rounded-full border",
                step === "idle" && "border-white/20 text-white/70",
                step === "starting" && "border-cyan-300/40 text-cyan-200",
                step === "waiting" && "border-amber-300/40 text-amber-200",
                step === "done" && "border-emerald-300/40 text-emerald-200",
                step === "error" && "border-red-300/40 text-red-200"
              )}
            >
              {step === "waiting" ? `waiting: ${statusText || "..."}` : step}
            </span>
          </div>

          <p className="mt-2 text-sm text-white/70">
            Prompt ჩაწერე → Generate. სისტემა შექმნის jobId-ს და ავტომატურად დაელოდება დასრულებას.
          </p>

          <div className="mt-4">
            <label className="text-xs text-white/60">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-cyan-400/40"
              placeholder="Describe the music…"
              disabled={step === "starting" || step === "waiting"}
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

            {(step === "starting" || step === "waiting") && (
              <button
                onClick={onStop}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                Stop
              </button>
            )}

            {jobId && (
              <div className="text-xs text-white/60 break-all">
                jobId: <span className="text-white/80">{jobId}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {step === "done" && remoteUrl && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-white/60 mb-2">Final MP3</div>

              <audio controls className="w-full" src={playableUrl || undefined} />

              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  onClick={onPreparePlay}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Prepare / Play
                </button>

                <button
                  onClick={onDownload}
                  className="rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/25"
                >
                  Download
                </button>

                {/* debug: sometimes useful to open raw url */}
                {debugUrl ? (
                  <a
                    href={debugUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                  >
                    Open debug publicUrl
                  </a>
                ) : null}
              </div>

              <div className="mt-3 text-xs text-white/50 break-all">fileUrl: {remoteUrl}</div>
              {debugUrl ? (
                <div className="mt-1 text-xs text-white/40 break-all">publicUrl: {debugUrl}</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}