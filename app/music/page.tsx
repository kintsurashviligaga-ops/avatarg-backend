"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Step = "idle" | "starting" | "waiting" | "done" | "error";

type StatusResponse = {
  ok: boolean;
  result?: {
    id: string;
    status: "queued" | "processing" | "done" | "error" | string;
    publicUrl?: string | null;
    filename?: string | null;
    errorMessage?: string | null;
    updatedAt?: string | null;
  };
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

export default function MusicPage() {
  const [prompt, setPrompt] = useState(
    "Georgian New Year vibe, upbeat pop, festive, 120bpm, joyful chorus"
  );

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>("");

  const [jobId, setJobId] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");

  const [publicUrl, setPublicUrl] = useState<string>("");
  const [filename, setFilename] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      // cleanup
      abortRef.current?.abort();
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, []);

  const canGenerate = useMemo(() => {
    const okPrompt = prompt.trim().length >= 6;
    const busy = step === "starting" || step === "waiting";
    return okPrompt && !busy;
  }, [prompt, step]);

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
      signal: abortRef.current?.signal,
    });

    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`Generate failed: ${res.status}\n${t}`);
    }

    const data = (await safeJson<any>(res)) || {};
    const id = data.jobId || data.id || data?.result?.jobId || data?.result?.id;

    if (!id || typeof id !== "string") {
      throw new Error(
        `Generate response missing jobId. Got: ${JSON.stringify(data).slice(0, 500)}`
      );
    }

    return id;
  }

  async function fetchStatus(id: string): Promise<StatusResponse> {
    const res = await fetch(`/api/music/status?id=${encodeURIComponent(id)}`, {
      method: "GET",
      signal: abortRef.current?.signal,
      cache: "no-store",
    });

    const data = (await safeJson<StatusResponse>(res)) || null;

    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(
        `Status failed: ${res.status}\n${data?.error || t || "Unknown error"}`
      );
    }

    if (!data) throw new Error("Status returned invalid JSON");
    return data;
  }

  function stopPolling() {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  async function onGenerate() {
    setError("");
    setPublicUrl("");
    setFilename("");
    setJobId("");
    setStatusText("");

    // abort previous
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    stopPolling();

    try {
      setStep("starting");

      const p = prompt.trim();
      const id = await startJob(p);
      setJobId(id);

      setStep("waiting");
      setStatusText("queued");

      // Immediately check once
      const first = await fetchStatus(id);
      const st = first.result?.status || "queued";
      setStatusText(st);

      if (st === "done") {
        const url = first.result?.publicUrl || "";
        if (!url) throw new Error("Job done but missing publicUrl");
        setPublicUrl(url);
        setFilename(first.result?.filename || `avatar-g-${Date.now()}.mp3`);
        setStep("done");
        return;
      }

      if (st === "error") {
        throw new Error(first.result?.errorMessage || "Music job failed");
      }

      // Poll every 2 seconds
      pollingRef.current = window.setInterval(async () => {
        try {
          const s = await fetchStatus(id);
          const status = s.result?.status || "queued";
          setStatusText(status);

          if (status === "done") {
            const url = s.result?.publicUrl || "";
            if (!url) throw new Error("Job done but missing publicUrl");
            setPublicUrl(url);
            setFilename(s.result?.filename || `avatar-g-${Date.now()}.mp3`);
            setStep("done");
            stopPolling();
          } else if (status === "error") {
            stopPolling();
            setStep("error");
            setError(s.result?.errorMessage || s.error || "Music job failed");
          }
        } catch (e: any) {
          // If aborted, ignore
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
    abortRef.current?.abort();
    stopPolling();
    setStep("idle");
    setStatusText("");
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
            Prompt ჩაწერე → Generate. სისტემა შექმნის jobId-ს და ავტომატურად დაელოდება
            დასრულებას. (კოდი აღარ გამოჩნდება ჩათში.)
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

          {publicUrl && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-white/60 mb-2">Final MP3</div>
              <audio controls className="w-full" src={publicUrl} />
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Open
                </a>
                <a
                  href={publicUrl}
                  download={filename || `avatar-g-${Date.now()}.mp3`}
                  className="rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/25"
                >
                  Download
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
