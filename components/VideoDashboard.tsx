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

  // pexels fallback (NOT final stitched)
  finalVideoUrl: string;

  // ✅ new
  renderJobId?: string;

  meta: {
    startedAt: string;
    finishedAt: string;
    stageTimingsMs: Partial<Record<PipelineStage, number>>;
  };
};

type RenderJobStatus =
  | "queued"
  | "processing"
  | "finalizing"
  | "completed"
  | "error"
  | "not_found"
  | "unknown";

type RenderStatusPayload = {
  id: string;
  status: RenderJobStatus;
  finalVideoUrl: string | null;
  error_message: string | null;
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

// ✅ client-side supabase (anon)
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anon) return null;
  return createClient(url, anon);
}

function normalizeJobStatus(s: any): RenderJobStatus {
  const v = String(s || "").toLowerCase();
  if (v === "queued") return "queued";
  if (v === "processing") return "processing";
  if (v === "finalizing") return "finalizing";
  if (v === "completed") return "completed";
  if (v === "error") return "error";
  if (v === "not_found") return "not_found";
  return "unknown";
}

function statusLabel(s: RenderJobStatus) {
  switch (s) {
    case "queued":
      return "Queued for Rendering";
    case "processing":
      return "Processing Video";
    case "finalizing":
      return "Finalizing";
    case "completed":
      return "Completed";
    case "error":
      return "Render Failed";
    case "not_found":
      return "Job Not Found";
    default:
      return "Waiting";
  }
}

export default function VideoDashboard() {
  const apiUrl = process.env.NEXT_PUBLIC_PENTAGON_API_URL || "";

  const [prompt, setPrompt] = useState("შექმენი მუსიკალური კლიპი");
  const [maxScenes, setMaxScenes] = useState(5);
  const [maxDurationSec, setMaxDurationSec] = useState(15);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<PentagonOutput | null>(null);

  // ✅ render job state
  const [renderJobId, setRenderJobId] = useState<string>("");
  const [renderStatus, setRenderStatus] = useState<RenderStatusPayload | null>(null);
  const [renderPolling, setRenderPolling] = useState(false);

  const pollerRef = useRef<number | null>(null);

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
    const segs = STAGES.map((s) => {
      const ms = stageTimings[s.key] ?? 0;
      return { ...s, ms };
    });
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

  const finalMp4Url = useMemo(() => {
    // ✅ prefer stitched final mp4 from worker result
    const fromWorker = renderStatus?.finalVideoUrl || "";
    if (fromWorker) return fromWorker;

    // fallback (not stitched) from pipeline
    return data?.finalVideoUrl || "";
  }, [renderStatus, data]);

  function stopPolling() {
    if (pollerRef.current) {
      window.clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
    setRenderPolling(false);
  }

  async function fetchRenderJobStatus(jobId: string) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    // ✅ RPC: public.get_render_job_status(uuid)
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_render_job_status", {
      job_id: jobId,
    });

    if (rpcError) {
      setRenderStatus({
        id: jobId,
        status: "unknown",
        finalVideoUrl: null,
        error_message: rpcError.message || "RPC error",
      });
      return;
    }

    // RPC შეიძლება აბრუნებდეს array-ს ან object-ს — გავამაგროთ
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    const status = normalizeJobStatus(row?.status);
    const finalVideoUrl = (row?.final_video_url ?? row?.finalVideoUrl ?? null) as string | null;
    const error_message = (row?.error_message ?? null) as string | null;

    setRenderStatus({
      id: jobId,
      status,
      finalVideoUrl: finalVideoUrl ? String(finalVideoUrl) : null,
      error_message: error_message ? String(error_message) : null,
    });

    if (status === "completed" || status === "error" || status === "not_found") {
      stopPolling();
    }
  }

  function startPolling(jobId: string) {
    stopPolling();
    setRenderPolling(true);

    // immediate fetch
    fetchRenderJobStatus(jobId);

    pollerRef.current = window.setInterval(() => {
      fetchRenderJobStatus(jobId);
    }, 3000);
  }

  useEffect(() => {
    // cleanup on unmount
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGenerate() {
    setError("");
    setData(null);
    setRenderStatus(null);
    setRenderJobId("");
    stopPolling();

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

      // ✅ if backend returned renderJobId, start polling
      const jobId = (json.renderJobId || "").trim();
      if (jobId) {
        setRenderJobId(jobId);
        startPolling(jobId);
      }
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function onRetryRendering() {
    setError("");
    if (!renderJobId) return;

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    // ✅ RPC: public.retry_render_job(uuid)
    const { error: rpcError } = await supabase.rpc("retry_render_job", {
      job_id: renderJobId,
    });

    if (rpcError) {
      setError(rpcError.message || "Retry failed");
      return;
    }

    // reset local status & resume polling
    setRenderStatus({
      id: renderJobId,
      status: "queued",
      finalVideoUrl: null,
      error_message: null,
    });

    startPolling(renderJobId);
  }

  // ✅ render progress steps
  const renderStep = useMemo(() => {
    // If no job id: only pipeline exists
    if (!renderJobId) return 0;

    const s = renderStatus?.status || "unknown";
    if (s === "queued") return 2;
    if (s === "processing") return 3;
    if (s === "finalizing") return 4;
    if (s === "completed") return 5;
    if (s === "error") return 99;
    return 1;
  }, [renderJobId, renderStatus]);

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

      {/* Pipeline Progress */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs text-white/70">
          <span>Pipeline Status</span>
          <span>{data ? `Total: ${msToSec(totalMs)}` : loading ? "Running…" : "Idle"}</span>
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
      </div>

      {/* ✅ Render Worker Progress */}
      {data?.renderJobId ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-white/60">Render Worker</div>
              <div className="text-sm text-white/85">
                Job: <span className="text-white/70">{renderJobId}</span>
              </div>
            </div>

            <div
              className={cn(
                "rounded-full px-3 py-1 text-[11px] border",
                renderStatus?.status === "completed"
                  ? "border-green-400/30 text-green-200 bg-green-400/10"
                  : renderStatus?.status === "error"
                  ? "border-red-400/30 text-red-200 bg-red-400/10"
                  : "border-cyan-400/30 text-cyan-200 bg-cyan-400/10"
              )}
            >
              {statusLabel(renderStatus?.status || (renderPolling ? "processing" : "unknown"))}
            </div>
          </div>

          {/* Steps */}
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {[
              { k: 1, t: "AI Logic Complete" },
              { k: 2, t: "Queued for Rendering" },
              { k: 3, t: "Processing Video" },
              { k: 4, t: "Finalizing" },
              { k: 5, t: "Completed" },
            ].map((x) => {
              const active = renderStep >= x.k && renderStep !== 99;
              const failed = renderStep === 99;
              return (
                <div
                  key={x.k}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs",
                    failed && x.k >= 2
                      ? "border-red-500/30 bg-red-500/10 text-red-200"
                      : active
                      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white/60"
                  )}
                >
                  {x.t}
                </div>
              );
            })}
          </div>

          {/* Error + Retry */}
          {renderStatus?.status === "error" ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              <div className="font-semibold">Render failed</div>
              {renderStatus.error_message ? (
                <div className="mt-1 text-xs text-red-200/90">{renderStatus.error_message}</div>
              ) : null}

              <button
                onClick={onRetryRendering}
                className={cn(
                  "mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold",
                  "bg-gradient-to-r from-[#3c2fff] to-[#00b7ff]",
                  "shadow-[0_0_30px_rgba(0,183,255,0.16)] hover:brightness-110 active:brightness-95"
                )}
              >
                🔁 Retry Rendering
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Output */}
      {data ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-white/60">Georgian Output</div>
              <div className="text-xl font-semibold">{data.localized?.title_ka || "—"}</div>
              <div className="text-sm text-white/75">{data.localized?.logline_ka || ""}</div>

              {/* ✅ final MP4 */}
              {finalMp4Url ? (
                <div className="mt-3">
                  <div className="mb-2 text-xs text-white/60">
                    {renderStatus?.finalVideoUrl ? "Final Render (Worker)" : "Preview (Pexels Fallback)"}
                  </div>
                  <video
                    className="w-full rounded-xl border border-white/10 bg-black/40"
                    src={finalMp4Url}
                    controls
                    playsInline
                    preload="metadata"
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Scenes */}
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

          {/* Debug */}
          <details className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
            <summary className="cursor-pointer text-sm text-white/80">Full Pipeline JSON</summary>
            <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] text-white/80">
              {JSON.stringify({ data, renderStatus }, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
      }
