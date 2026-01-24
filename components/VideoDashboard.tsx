"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type JobStatus = "queued" | "processing" | "rendering" | "completed" | "failed";

type PentagonResponse = {
  success: boolean;
  renderJobId?: string;
  status?: JobStatus;
  progress?: number;
  statusEndpoint?: string;
  // optional extras (if you later return them)
  finalVideoUrl?: string | null;
  error?: string;
};

type RenderStatusResponse =
  | {
      success: true;
      job: {
        id: string;
        status: JobStatus;
        progress: number;
        resultUrl: string | null;
        errorMessage: string | null;
        createdAt?: string;
        updatedAt?: string;
      };
    }
  | { success: false; error: string; jobId?: string };

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function ProgressBar({
  status,
  progress,
}: {
  status: JobStatus;
  progress: number;
}) {
  const ui = useMemo(() => {
    switch (status) {
      case "queued":
        return {
          label: "Queued…",
          bar: "bg-slate-500",
          text: "text-slate-200",
        };
      case "processing":
        return {
          label: "Processing…",
          bar: "bg-blue-500",
          text: "text-blue-200",
        };
      case "rendering":
        return {
          label: "Rendering…",
          bar: "bg-purple-500",
          text: "text-purple-200",
        };
      case "completed":
        return {
          label: "Completed ✅",
          bar: "bg-green-500",
          text: "text-green-200",
        };
      case "failed":
      default:
        return {
          label: "Failed ❌",
          bar: "bg-red-500",
          text: "text-red-200",
        };
    }
  }, [status]);

  const pct = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));

  return (
    <div className="mt-4">
      <div className={cn("mb-2 text-sm", ui.text)}>
        {ui.label} — {pct}%
      </div>
      <div className="h-3 w-full rounded-full bg-white/10 overflow-hidden border border-white/10">
        <div
          className={cn("h-full transition-all duration-300", ui.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function statusLabel(s: JobStatus) {
  switch (s) {
    case "queued":
      return "Waiting in queue…";
    case "processing":
      return "Processing assets…";
    case "rendering":
      return "Rendering final video…";
    case "completed":
      return "Completed ✅";
    case "failed":
      return "Failed ❌";
    default:
      return "Working…";
  }
}

export default function VideoDashboard() {
  // ✅ Use local Next.js route by default (best for CORS + deploy)
  const PENTAGON_ENDPOINT = "/api/pentagon";

  const [prompt, setPrompt] = useState("შექმენი მუსიკალური კლიპი");
  const [maxScenes, setMaxScenes] = useState(5);
  const [maxDurationSec, setMaxDurationSec] = useState(15);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // render tracking
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("queued");
  const [progress, setProgress] = useState<number>(0);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);

  const pollerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollerRef.current) {
      window.clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
    inFlightRef.current = false;
  }, []);

  const fetchStatus = useCallback(
    async (id: string) => {
      if (!id) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const r = await fetch(`/api/render-status/${id}`, { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as RenderStatusResponse | null;

        if (!r.ok || !j || (j as any).success !== true) {
          const msg =
            (j as any)?.error ||
            `Status error (${r.status})` ||
            "Status request failed";
          setError(msg);
          return;
        }

        const job = (j as any).job;
        if (!job) return;

        setJobStatus(job.status);
        setProgress(job.progress ?? 0);
        setFinalUrl(job.resultUrl ?? null);

        if (job.status === "failed") {
          setError(job.errorMessage || "Render failed");
          stopPolling();
        }

        if (job.status === "completed") {
          stopPolling();
        }
      } catch (e: any) {
        setError(e?.message || "Polling failed");
        stopPolling();
      } finally {
        inFlightRef.current = false;
      }
    },
    [stopPolling]
  );

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      fetchStatus(id);

      pollerRef.current = window.setInterval(() => {
        fetchStatus(id);
      }, 2500);
    },
    [fetchStatus, stopPolling]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const onGenerate = useCallback(async () => {
    setError("");
    setFinalUrl(null);
    setProgress(0);
    setJobStatus("queued");
    setJobId(null);
    stopPolling();

    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(PENTAGON_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          userPrompt: prompt.trim(),
          constraints: {
            maxScenes,
            maxDurationSec,
            style: "cinematic, professional, 4K, beautiful lighting",
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as PentagonResponse | null;

      if (!res.ok || !data || data.success !== true) {
        throw new Error(data?.error || `Generate failed (${res.status})`);
      }

      const id = (data.renderJobId || "").trim();
      if (!id) {
        throw new Error("renderJobId is missing in response.");
      }

      setJobId(id);
      setJobStatus(data.status ?? "queued");
      setProgress(data.progress ?? 0);

      // if backend already provides final url (optional)
      if (data.finalVideoUrl) setFinalUrl(data.finalVideoUrl);

      startPolling(id);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [PENTAGON_ENDPOINT, prompt, maxScenes, maxDurationSec, startPolling, stopPolling]);

  const badgeClass = useMemo(() => {
    if (jobStatus === "completed") return "border-green-400/30 text-green-200 bg-green-400/10";
    if (jobStatus === "failed") return "border-red-400/30 text-red-200 bg-red-400/10";
    if (jobStatus === "rendering") return "border-purple-400/30 text-purple-200 bg-purple-400/10";
    return "border-cyan-400/30 text-cyan-200 bg-cyan-400/10";
  }, [jobStatus]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_80px_rgba(90,30,255,0.15)] backdrop-blur">
      {/* Controls */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <label className="text-xs text-white/70">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className={cn(
              "mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none",
              "focus:border-[#6a5cff] focus:ring-2 focus:ring-[#6a5cff]/30"
            )}
            placeholder="Write what you want the pipeline to generate…"
          />

          <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
            <div className="flex items-center gap-2">
              <span>Max Scenes</span>
              <input
                type="number"
                min={1}
                max={10}
                value={maxScenes}
                onChange={(e) => setMaxScenes(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <span>Max Duration (sec)</span>
              <input
                type="number"
                min={6}
                max={120}
                value={maxDurationSec}
                onChange={(e) =>
                  setMaxDurationSec(Math.max(6, Math.min(120, Number(e.target.value) || 15)))
                }
                className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-end">
          <button
            onClick={onGenerate}
            disabled={loading}
            className={cn(
              "w-full md:w-52 rounded-xl px-4 py-3 text-sm font-semibold",
              "bg-gradient-to-r from-[#3c2fff] to-[#00b7ff]",
              "shadow-[0_0_40px_rgba(0,183,255,0.18)]",
              "hover:brightness-110 active:brightness-95",
              loading && "opacity-60 cursor-not-allowed"
            )}
          >
            {loading ? "Generating…" : "🚀 Generate Video"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Worker / Job */}
      {jobId ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-white/60">Render Worker</div>
              <div className="text-sm text-white/85">
                Job: <span className="text-white/70">{jobId}</span>
                <span className="text-white/50"> • polling 2.5s</span>
              </div>
            </div>

            <div className={cn("rounded-full px-3 py-1 text-[11px] border", badgeClass)}>
              {statusLabel(jobStatus)}
            </div>
          </div>

          <ProgressBar status={jobStatus} progress={progress} />

          {/* Final video */}
          {finalUrl && jobStatus === "completed" ? (
            <div className="mt-4">
              <div className="mb-2 text-xs text-white/60">Final Render</div>

              <video
                className="w-full rounded-xl border border-white/10 bg-black/40"
                src={finalUrl}
                controls
                playsInline
                preload="metadata"
              />

              <div className="mt-2 flex gap-3">
                <a
                  href={finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-200/90 underline underline-offset-4"
                >
                  Open video
                </a>
                <a
                  href={finalUrl}
                  download
                  className="text-xs text-cyan-200/90 underline underline-offset-4"
                >
                  Download MP4
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
                }
