'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type RenderJobStatus =
  | 'queued'
  | 'processing'
  | 'finalizing'
  | 'completed'
  | 'error'
  | 'not_found'
  | 'unknown';

type RenderStatusPayload = {
  id: string;
  status: RenderJobStatus;
  finalVideoUrl: string | null;
  error_message: string | null;
};

type PentagonResult = {
  success?: boolean;
  error?: string;

  finalVideoUrl?: string;
  renderJobId?: string;

  voiceovers?: {
    voiceovers?: Array<{
      sceneId: string;
      text: string;
      audioUrl?: string;
      provider?: string;
    }>;
  };

  videos?: Array<{ sceneId: string; videoUrl?: string; imageUrl?: string }>;
  localized?: { title_ka?: string; logline_ka?: string };
  meta?: { stageTimingsMs?: Record<string, number> };

  [key: string]: any;
};

const ENABLE_STATUS_POLLING = false; // ✅ ჩართე true მხოლოდ მაშინ, თუ /api/render-status რეალურად გაქვს

function normalizeJobStatus(s: any): RenderJobStatus {
  const v = String(s || '').toLowerCase();
  if (v === 'queued') return 'queued';
  if (v === 'processing') return 'processing';
  if (v === 'finalizing') return 'finalizing';
  if (v === 'completed') return 'completed';
  if (v === 'error') return 'error';
  if (v === 'not_found') return 'not_found';
  return 'unknown';
}

function statusText(s: RenderJobStatus) {
  switch (s) {
    case 'queued':
      return 'Waiting for an available render node...';
    case 'processing':
      return 'FFmpeg is stitching your video and burning subtitles...';
    case 'finalizing':
      return 'Finalizing and uploading MP4...';
    case 'completed':
      return 'Completed ✅';
    case 'error':
      return 'Render failed ❌';
    case 'not_found':
      return 'Job not found';
    default:
      return 'Preparing...';
  }
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), raw: text };
  } catch {
    return { json: null, raw: text };
  }
}

function calculateTotalTime(timings: any): number {
  if (!timings) return 0;
  return Object.values(timings).reduce((acc: number, val: any) => acc + (Number(val) || 0), 0);
}

export default function PentagonTestPage() {
  const [prompt, setPrompt] = useState('შექმენი მუსიკალური კლიპი');
  const [result, setResult] = useState<PentagonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Worker polling state (optional)
  const [renderJobId, setRenderJobId] = useState<string>('');
  const [renderStatus, setRenderStatus] = useState<RenderStatusPayload | null>(null);
  const pollerRef = useRef<number | null>(null);

  const endpoint = useMemo(() => {
    const env = process.env.NEXT_PUBLIC_PENTAGON_API_URL?.trim();
    if (env) return env; // ✅ მთავარი
    return '/api/v1/pentagon'; // fallback მხოლოდ ლოკალზე თუ გაქვს route
  }, []);

  function stopPolling() {
    if (pollerRef.current) {
      window.clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
  }

  async function fetchRenderJobStatus(jobId: string) {
    try {
      // ⚠️ ეს endpoint უნდა არსებობდეს, თორემ არ ჩართო polling (ENABLE_STATUS_POLLING=false)
      const url = `/api/render-status?jobId=${encodeURIComponent(jobId)}`;
      const res = await fetch(url, { method: 'GET' });
      const { json, raw } = await safeReadJson(res);

      if (!res.ok) {
        setRenderStatus({
          id: jobId,
          status: 'unknown',
          finalVideoUrl: null,
          error_message: `Status endpoint HTTP ${res.status}: ${raw?.slice(0, 180) || ''}`,
        });
        return;
      }

      const row = Array.isArray(json) ? json[0] : json;

      const status = normalizeJobStatus(row?.status);
      const finalVideoUrl = (row?.final_video_url ?? row?.finalVideoUrl ?? null) as string | null;
      const error_message = (row?.error_message ?? null) as string | null;

      setRenderStatus({
        id: jobId,
        status,
        finalVideoUrl: finalVideoUrl ? String(finalVideoUrl) : null,
        error_message: error_message ? String(error_message) : null,
      });

      if (status === 'completed' || status === 'error' || status === 'not_found') {
        stopPolling();
      }
    } catch (e: any) {
      setRenderStatus({
        id: jobId,
        status: 'unknown',
        finalVideoUrl: null,
        error_message: e?.message || 'Failed to fetch render status',
      });
    }
  }

  function startPolling(jobId: string) {
    stopPolling();
    fetchRenderJobStatus(jobId);
    pollerRef.current = window.setInterval(() => fetchRenderJobStatus(jobId), 3000);
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const finalMp4Url = useMemo(() => {
    const fromWorker = renderStatus?.finalVideoUrl || '';
    if (fromWorker) return fromWorker;
    return result?.finalVideoUrl || '';
  }, [renderStatus, result]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setRenderStatus(null);
    setRenderJobId('');
    stopPolling();

    if (!endpoint) {
      setLoading(false);
      setError('Missing endpoint. Set NEXT_PUBLIC_PENTAGON_API_URL in Vercel env.');
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000); // 120s

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userPrompt: prompt.trim(),
          constraints: {
            maxScenes: 5,
            maxDurationSec: 90,
            style: 'cinematic, professional, 4K, beautiful lighting',
          },
        }),
      });

      const { json, raw } = await safeReadJson(response);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${raw?.slice(0, 300) || 'Request failed'}`);
      }

      const data = (json || {}) as PentagonResult;

      const success = data.success ?? true; // ზოგ API-ში success field არ არის
      if (!success) {
        setError(data.error || 'Pipeline failed');
        return;
      }

      setResult(data);

      // ✅ backend-მა თუ დააბრუნა renderJobId
      const jobId = String(data.renderJobId || '').trim();
      if (jobId) {
        setRenderJobId(jobId);

        // ✅ polling მხოლოდ თუ ჩართულია
        if (ENABLE_STATUS_POLLING) startPolling(jobId);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('Request timed out. Try again.');
      } else {
        setError(err?.message || 'Failed to fetch');
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: '0 auto',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system',
      }}
    >
      <h1 style={{ fontSize: 34, marginBottom: 8 }}>🎬 AI Pentagon Video Generator (Test)</h1>

      <p style={{ color: '#666', marginBottom: 18 }}>
        Endpoint:{' '}
        <code style={{ background: '#f2f2f2', padding: '2px 6px', borderRadius: 6 }}>
          {endpoint}
        </code>
      </p>

      <div style={{ marginBottom: 18 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Create a cinematic video about Georgian mountains at sunset"
          rows={4}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            borderRadius: 10,
            border: '1px solid #ddd',
            outline: 'none',
          }}
        />

        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            marginTop: 12,
            padding: '14px 18px',
            fontSize: 16,
            background: loading ? '#bbb' : 'linear-gradient(to right, #3b82f6, #8b5cf6)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            cursor: loading ? 'not-allowed' : 'pointer',
            width: '100%',
            fontWeight: 800,
          }}
        >
          {loading ? '⏳ Generating (up to 120s)...' : '🚀 Generate Video'}
        </button>
      </div>

      {/* Worker status (if renderJobId exists) */}
      {renderJobId ? (
        <div
          style={{
            marginBottom: 18,
            padding: 14,
            borderRadius: 12,
            border: '1px solid #ddd',
            background: '#fafafa',
          }}
        >
          <div style={{ fontSize: 13, color: '#555' }}>Render Worker</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            Job ID: <code>{renderJobId}</code>
          </div>

          <div style={{ marginTop: 10, fontSize: 14 }}>
            <strong>Status:</strong>{' '}
            {ENABLE_STATUS_POLLING ? statusText(renderStatus?.status || 'unknown') : 'Polling disabled on this page'}
          </div>

          {renderStatus?.status === 'error' && (
            <div style={{ marginTop: 10, color: '#b00020', fontSize: 13 }}>
              {renderStatus.error_message || 'Unknown render error'}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 12, color: '#777' }}>
            Tip: This test page can skip worker polling. Your real UI polling is in VideoDashboard.tsx.
          </div>
        </div>
      ) : null}

      {error && (
        <div
          style={{
            background: '#fee',
            padding: 14,
            borderRadius: 12,
            marginBottom: 18,
            color: '#b00020',
            border: '1px solid #f3b4b4',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>✅ Pipeline Returned</h2>

          {/* MAIN VIDEO */}
          {finalMp4Url ? (
            <div style={{ background: '#000', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
              <video
                controls
                style={{ width: '100%', display: 'block' }}
                src={finalMp4Url}
                playsInline
                preload="metadata"
              />
            </div>
          ) : (
            <div
              style={{
                marginBottom: 18,
                padding: 14,
                borderRadius: 12,
                border: '1px solid #ddd',
                background: '#fafafa',
                color: '#444',
              }}
            >
              No <code>finalVideoUrl</code> yet. If you rely on worker stitching, ensure your pipeline returns{' '}
              <code>renderJobId</code> and your real UI (VideoDashboard.tsx) polls Supabase.
            </div>
          )}

          {/* LOCALIZED TEXT */}
          {result.localized ? (
            <div style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 18, marginBottom: 10 }}>🇬🇪 Georgian Translation</h3>
              <div style={{ background: '#fef3c7', padding: 14, borderRadius: 12, border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>{result.localized.title_ka}</div>
                <div style={{ fontSize: 13, color: '#444' }}>{result.localized.logline_ka}</div>
              </div>
            </div>
          ) : null}

          {/* GEORGIAN VOICEOVERS */}
          {result.voiceovers?.voiceovers?.length ? (
            <div style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 18, marginBottom: 10 }}>
                🎤 Georgian Voiceovers ({result.voiceovers.voiceovers.length})
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {result.voiceovers.voiceovers.map((vo: any, idx: number) => (
                  <div key={idx} style={{ background: '#f0f9ff', borderRadius: 12, padding: 12, border: '1px solid #dbeafe' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>{vo.sceneId}</div>
                    <div style={{ fontSize: 12, color: '#333', marginBottom: 8, fontStyle: 'italic' }}>"{vo.text}"</div>
                    {vo.audioUrl ? (
                      <audio controls style={{ width: '100%' }} src={vo.audioUrl} />
                    ) : (
                      <div style={{ fontSize: 12, color: '#666' }}>No audioUrl</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ALL SCENE VIDEOS */}
          {result.videos?.length ? (
            <div style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 18, marginBottom: 10 }}>🎞️ All Scenes ({result.videos.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {result.videos.map((render: any, idx: number) => (
                  <div key={idx} style={{ background: '#f9f9f9', borderRadius: 12, padding: 12, border: '1px solid #eee' }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Scene: {render.sceneId}</div>
                    {render.videoUrl ? (
                      <>
                        <video controls style={{ width: '100%', borderRadius: 10 }} src={render.videoUrl} playsInline preload="metadata" />
                        <a href={render.videoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563eb', display: 'block', marginTop: 8 }}>
                          Open in new tab →
                        </a>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: '#666' }}>No videoUrl for this scene</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* PIPELINE TIMINGS */}
          {result.meta?.stageTimingsMs ? (
            <div style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 18, marginBottom: 10 }}>⏱️ Pipeline Performance</h3>
              <div style={{ background: '#f5f5f5', padding: 14, borderRadius: 12, border: '1px solid #eee' }}>
                {Object.entries(result.meta.stageTimingsMs).map(([stage, ms]: [string, any]) => (
                  <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13 }}>{stage}</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#2563eb' }}>
                      {((Number(ms) || 0) / 1000).toFixed(2)}s
                    </span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #ddd', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 900 }}>Total Time</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#7c3aed' }}>
                    {(calculateTotalTime(result.meta.stageTimingsMs) / 1000).toFixed(2)}s
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* DEBUG */}
          <details style={{ marginTop: 18 }}>
            <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 900 }}>🔍 Full Pipeline Data</summary>
            <pre
              style={{
                background: '#0b1020',
                color: '#e5e7eb',
                padding: 14,
                borderRadius: 12,
                overflow: 'auto',
                fontSize: 12,
                marginTop: 10,
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {JSON.stringify({ endpoint, result, renderJobId, renderStatus }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
  }
