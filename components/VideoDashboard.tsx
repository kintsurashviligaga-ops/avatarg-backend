"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PipelineStage =
  | "structure_generation"
  | "gpt_edit"
  | "georgian_localization"
  | "voiceover_generation"
  | "visual_prompting"
  | "video_rendering";

type PentagonInput = {
  requestId: string;
  userPrompt: string;
  constraints?: {
    maxScenes?: number;
    maxDurationSec?: number;
    style?: string;
  };
};

type PentagonOutput = {
  requestId: string;
  structure: { title: string; logline: string; scenes: any[] };
  edited: { title: string; logline: string; scenes: any[]; globalNotes: string[] };
  localized: {
    title_ka: string;
    logline_ka: string;
    scenes_ka: Array<{
      id: string;
      beat_ka: string;
      camera_ka: string;
      setting_ka: string;
      characters_ka: string[];
      action_ka: string;
      narration_ka: string;
    }>;
  };
  voiceovers: {
    voiceovers: Array<{
      sceneId: string;
      text: string;
      audioUrl: string;
      provider: "elevenlabs" | "google_tts" | "none";
    }>;
  };
  visualPrompts: { shots: Array<{ sceneId: string; prompt: string }> };
  videos: Array<{ sceneId: string; imageUrl: string; videoUrl: string }>;

  // old field (first pexels clip)
  finalVideoUrl: string;

  // ✅ new field from backend enqueue
  renderJobId?: string;

  meta: {
    startedAt: string;
    finishedAt: string;
    stageTimingsMs: Partial<Record<PipelineStage, number>>;
  };
};

// ✅ render_jobs row shape (minimal fields we care)
type RenderJobRow = {
  id: string;
  status: "queued" | "processing" | "completed" | "error" | string;
  output_url: string | null;
  error_message: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_at?: string | null;
};

const STAGES: Array<{ key: PipelineStage; label: string }> = [
  { key: "structure_generation", label: "Structure" },
  { key: "gpt_edit", label: "Edit" },
  { key: "georgian_localization", label: "Georgian" },
  { key: "voiceover_generation", label: "Voiceover" },
  { key: "visual_prompting", label: "Visual Prompts" },
  { key: "video_rendering", label: "Pexels Render" },
];

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function msToSec(ms?: number) {
  if (!ms || typeof ms !== "number") return "—";
  return (ms / 1000).toFixed(2) + "s";
}

function makeRequestId() {
  return "req_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

function mapRenderStatusToUi(
  job: RenderJobRow | null,
  aiDone: boolean
): { label: string; hint: string; tone: "idle" | "run" | "good" | "bad" } {
  if (!aiDone) return { label: "Idle", hint: "Waiting for generation", tone: "idle" };

  // AI pipeline finished but job not created (backend misconfig)
  if (aiDone && !job) return { label: "AI Logic Complete", hint: "Render job not found", tone: "bad" };

  const s = (job?.status || "").toLowerCase();

  if (s === "queued") return { label: "Queued for Rendering", hint: "Worker will pick it up", tone: "run" };
  if (s === "processing") return { label: "Processing Video", hint: "Rendering scenes + stitching", tone: "run" };
  if (s === "completed") return { label: "Completed", hint: "Final MP4 is ready", tone: "good" };
  if (s === "error") return { label: "Render Failed", hint: job?.error_message || "Unknown error", tone: "bad" };

  // fallback for unknown statuses
  return { label: `Finalizing`, hint: `status: ${job?.status || "unknown"}`, tone: "run" };
}

export default function VideoDashboard() {
  const apiUrl = process.env.NEXT_PUBLIC_PENTAGON_API_URL || "";

  // ✅ Supabase browser client (anon)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnon) return null;
    return createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, [supabaseUrl, supabaseAnon]);

  const [prompt, setPrompt] = useState("შექმენი მუსიკალური კლიპი");
  const [maxScenes, setMaxScenes] = useState(5);
  const [maxDurationSec, setMaxDurationSec] = useState(15);

  // pipeline + ui
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<PentagonOutput | null>(null);

  // ✅ render job polling state
  const [renderJobId, setRenderJobId] = useState<string>("");
  const [renderJob, setRenderJob] = useState<RenderJobRow | null>(null);
  const [renderPolling, setRenderPolling] = useState(false);
  const [renderError, setRenderError] = useState<string>("");

  const pollTimerRef = useRef<number | null>(null);

  const stageTimings = data?.meta?.stageTimingsMs || {};
  const totalMs = useMemo(() => {
    let t = 0;
    for (const s of STAGES) {
      const v = stageTimings[s.key];
      if (typeof v === "number") t += v;
    }
    return t;
  }, [stageTimings]);

  const segments = useMemo(() => {
    const segs = STAGES.map((s) => ({ ...s, ms: stageTimings[s.key] ?? 0 }));
    const sum = segs.reduce((a, b) => a + (typeof b.ms === "number" ? b.ms : 0), 0) || 1;
    return segs.map((x) => ({ ...x, pct: Math.max(1, Math.round((x.ms / sum) * 100)) }));
  }, [stageTimings]);

  const sceneRows = useMemo(() => {
    if (!data) return [];
    const scenes = Array.isArray(data.localized?.scenes_ka) ? data.localized.scenes_ka : [];
    const videos = Array.isArray(data.videos) ? data.videos : [];
    const voiceovers = Array.isArray(data.voiceovers?.voiceovers) ? data.voiceovers.voiceovers : [];

    return scenes.map((s) => {
      const v = videos.find((x) => x.sceneId === s.id);
      const a = voiceovers.find((x) => x.sceneId === s.id);
      return {
        id: s.id,
        narration_ka: s.narration_ka || s.action_ka || s.beat_ka || "",
        videoUrl: v?.videoUrl || "",
        imageUrl: v?.imageUrl || "",
        audioUrl: a?.audioUrl || "",
        provider: a?.provider || "none",
        prompt: data.visualPrompts?.shots?.find((p) => p.sceneId === s.id)?.prompt || "",
      };
    });
  }, [data]);

  // ✅ clear interval on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, []);

  async function fetchJobOnce(jobId: string) {
    if (!supabase) {
      setRenderError("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setRenderError("");
    const { data, error } = await supabase
      .from("render_jobs")
      .select("id,status,output_url,error_message,updated_at,started_at,completed_at,error_at")
      .eq("id", jobId)
      .single();

    if (error) {
      setRenderError(error.message || "Failed to fetch render job");
      return;
    }

    setRenderJob((data as any) || null);
  }

  function startPolling(jobId: string) {
    if (!jobId) return;

    // stop existing
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);

    setRenderPolling(true);

    // immediate fetch
    fetchJobOnce(jobId);

    pollTimerRef.current = window.setInterval(async () => {
      await fetchJobOnce(jobId);

      // stop when done/error
      const current = (renderJob as any)?.status?.toLowerCase?.();
      if (current === "completed" || current === "error") {
        if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setRenderPolling(false);
      }
    }, 3000);
  }

  // ✅ whenever renderJob updates, stop polling when terminal
  useEffect(() => {
    const s = (renderJob?.status || "").toLowerCase();
    if (s === "completed" || s === "error") {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      setRenderPolling(false);
    }
  }, [renderJob?.status]);

  async function onGenerate() {
    setError("");
    setData(null);

    // reset render states
    setRenderJobId("");
    setRenderJob(null);
    setRenderError("");
    setRenderPolling(false);
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;

    if (!apiUrl) {
      setError("Missing NEXT_PUBLIC_PENTAGON_API_URL env var.");
      return;
    }
    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }

    setLoading(true);
    try {
      const body: PentagonInput = {
        requestId: makeRequestId(),
        userPrompt: prompt.trim(),
        constraints: { maxScenes, maxDurationSec, style: "cyberpunk-dark" },
      };

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t || "Request failed"}`);
      }

      const json = (await res.json()) as PentagonOutput;

      setData(json);

      // ✅ Start render job polling
      const jobId = (json?.renderJobId || "").toString();
      if (jobId) {
        setRenderJobId(jobId);
        startPolling(jobId);
      } else {
        setRenderError(
          "renderJobId is missing from backend response. Ensure coordinator.ts enqueues render_jobs and returns renderJobId."
        );
      }
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function onRetryRender() {
    setRenderError("");
    if (!supabase) {
      setRenderError("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    if (!renderJobId) {
      setRenderError("Missing renderJobId.");
      return;
    }

    const { error } = await supabase
      .from("render_jobs")
      .update({
        status: "queued",
        error_message: null,
        output_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", renderJobId);

    if (error) {
      setRenderError(error.message || "Failed to retry render job");
      return;
    }

    // reset + restart polling
    setRenderJob((prev) => (prev ? { ...prev, status: "queued", error_message: null, output_url: null } : prev));
    startPolling(renderJobId);
  }

  const aiDone = !!data;
  const uiStatus = mapRenderStatusToUi(renderJob, aiDone);

  const badgeClass =
    uiStatus.tone === "good"
      ? "border-emerald-400/30 text-emerald-200 bg-emerald-400/10"
      : uiStatus.tone === "bad"
      ? "border-red-400/30 text-red-200 bg-red-400/10"
      : uiStatus.tone === "run"
      ? "border-cyan-400/30 text-cyan-200 bg-cyan-400/10"
      : "border-white/10 text-white/60 bg-white/5";

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
                onChange={(e) => setMaxDurationSec(Math.max(6, Math.min(120, Number(e.target.value) || 15)))}
                className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2">
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

          {/* Retry button (only when render failed) */}
          {renderJob?.status?.toLowerCase() === "error" ? (
            <button
              onClick={onRetryRender}
              className={cn(
                "rounded-xl px-4 py-3 text-sm font-semibold border",
                "border-red-400/25 bg-red-500/10 text-red-100 hover:bg-red-500/15"
              )}
            >
              ↻ Retry Rendering
            </button>
          ) : null}
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Render polling errors */}
      {renderError ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {renderError}
        </div>
      ) : null}

      {/* Progress */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs text-white/70">
          <span>Pipeline Status</span>
          <span>{data ? `AI Total: ${msToSec(totalMs)}` : loading ? "Running…" : "Idle"}</span>
        </div>

        <div className="relative h-3 overflow-hidden rounded-full border border-white/10 bg-black/40">
          {loading ? (
            <div className="absolute inset-y-0 left-0 w-1/2 animate-pulse bg-gradient-to-r from-[#3c2fff] to-[#00b7ff]" />
          ) : data ? (
            <div className="flex h-full w-full">
              {segments.map((s) => (
                <div
                  key={s.key}
                  title={`${s.label}: ${msToSec(s.ms)}`}
                  style={{ width: `${s.pct}%` }}
                  className="h-full bg-gradient-to-r from-[#3c2fff] to-[#00b7ff] opacity-80"
                />
              ))}
            </div>
          ) : (
            <div className="h-full w-0" />
          )}
        </div>

        {/* Timings list */}
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {STAGES.map((s) => (
            <div
              key={s.key}
              className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/80"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.label}</span>
                <span className="text-white/70">{data ? msToSec(stageTimings[s.key]) : "—"}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ✅ Render Job Status Row */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <div className="text-xs text-white/60">Render Status</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{uiStatus.label}</span>
                <span className={cn("rounded-full px-2 py-1 text-[11px] border", badgeClass)}>
                  {renderPolling ? "Polling…" : renderJobId ? "Tracking" : "—"}
                </span>
              </div>
              <div className="mt-1 text-xs text-white/60">{uiStatus.hint}</div>
            </div>

            <div className="text-xs text-white/60">
              <div>
                <span className="text-white/70">job:</span> {renderJobId || "—"}
              </div>
              <div className="mt-1">
                <span className="text-white/70">status:</span> {renderJob?.status || (aiDone ? "unknown" : "—")}
              </div>
            </div>
          </div>

          {/* subtle render progress bar */}
          <div className="mt-3 relative h-2 overflow-hidden rounded-full border border-white/10 bg-black/40">
            {renderJob?.status?.toLowerCase() === "queued" || renderJob?.status?.toLowerCase() === "processing" ? (
              <div className="absolute inset-y-0 left-0 w-1/2 animate-pulse bg-gradient-to-r from-[#3c2fff] to-[#00b7ff]" />
            ) : renderJob?.status?.toLowerCase() === "completed" ? (
              <div className="h-full w-full bg-gradient-to-r from-[#3c2fff] to-[#00b7ff] opacity-80" />
            ) : (
              <div className="h-full w-0" />
            )}
          </div>
        </div>
      </div>

      {/* Output */}
      {data ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-white/60">Georgian Output</div>
              <div className="text-xl font-semibold">{data.localized?.title_ka || "—"}</div>
              <div className="text-sm text-white/75">{data.localized?.logline_ka || ""}</div>

              {/* ✅ Final MP4 from worker */}
              {renderJob?.status?.toLowerCase() === "completed" && renderJob.output_url ? (
                <div className="mt-3">
                  <div className="mb-2 text-xs text-white/70">Final Render (Worker)</div>
                  <video
                    className="w-full rounded-xl border border-white/10 bg-black/40"
                    src={renderJob.output_url}
                    controls
                    playsInline
                    preload="metadata"
                  />
                  <a
                    className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                    href={renderJob.output_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ▶ Open Final MP4
                  </a>
                </div>
              ) : null}

              {/* fallback: first pexels */}
              {data.finalVideoUrl ? (
                <a
                  className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                  href={data.finalVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  ▶ Open MP4 (Pexels Clip)
                </a>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {sceneRows.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_0_60px_rgba(90,30,255,0.10)]"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">{s.id}</div>
                  <div
                    className={cn(
                      "rounded-full px-2 py-1 text-[11px] border",
                      s.provider === "google_tts"
                        ? "border-cyan-400/30 text-cyan-200 bg-cyan-400/10"
                        : s.provider === "elevenlabs"
                        ? "border-purple-400/30 text-purple-200 bg-purple-400/10"
                        : "border-white/10 text-white/60 bg-white/5"
                    )}
                  >
                    {s.provider}
                  </div>
                </div>

                {s.videoUrl ? (
                  <video
                    className="w-full rounded-xl border border-white/10 bg-black/40"
                    src={s.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-xs text-white/60">
                    No video found for this scene.
                  </div>
                )}

                <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white/85">
                  {s.narration_ka || "—"}
                </div>

                <div className="mt-3">
                  {s.audioUrl ? (
                    <audio className="w-full" controls src={s.audioUrl} />
                  ) : (
                    <div className="text-xs text-white/60">No audio for this scene.</div>
                  )}
                </div>

                {s.prompt ? (
                  <div className="mt-3 text-[11px] text-white/60">
                    <span className="text-white/70">Pexels Query:</span> {s.prompt}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <details className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
            <summary className="cursor-pointer text-sm text-white/80">Full Pipeline JSON</summary>
            <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] text-white/80">
              {JSON.stringify({ ...data, renderJob }, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}

      {/* ✅ Helpful note when Supabase env missing */}
      {!supabase ? (
        <div className="mt-5 text-xs text-white/60">
          ⚠️ Supabase browser client is not configured. Add{" "}
          <span className="text-white/80">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="text-white/80">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to enable render status polling.
        </div>
      ) : null}
    </section>
  );
            }
