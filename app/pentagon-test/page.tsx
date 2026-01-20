'use client';

import { useState } from 'react';

export default function PentagonTestPage() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/v1/pentagon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: prompt,
          constraints: {
            maxScenes: 5,
            maxDurationSec: 90,
            style: 'cinematic, professional, 4K, beautiful lighting',
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Pipeline failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '36px', marginBottom: '10px' }}>🎬 AI Pentagon Video Generator</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        GPT-4o → GPT-4o → GPT-4o → ElevenLabs → Grok → Pollinations AI
      </p>

      <div style={{ marginBottom: '20px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Create a cinematic video about Georgian mountains at sunset"
          rows={4}
          style={{
            width: '100%',
            padding: '15px',
            fontSize: '16px',
            borderRadius: '8px',
            border: '2px solid #ddd',
          }}
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            marginTop: '15px',
            padding: '15px 40px',
            fontSize: '18px',
            background: loading ? '#ccc' : 'linear-gradient(to right, #3b82f6, #8b5cf6)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            width: '100%',
          }}
        >
          {loading ? '⏳ Generating (30-60s)...' : '🚀 Generate Video'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee', padding: '20px', borderRadius: '8px', marginBottom: '20px', color: '#c00' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div>
          <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>✅ Video Generated!</h2>

          {/* MAIN VIDEO */}
          {result.finalVideoUrl && (
            <div style={{ background: '#000', borderRadius: '12px', overflow: 'hidden', marginBottom: '30px' }}>
              <video
                controls
                autoPlay
                loop
                style={{ width: '100%', display: 'block' }}
                src={result.finalVideoUrl}
              >
                Your browser does not support video playback.
              </video>
            </div>
          )}

          {/* GEORGIAN VOICEOVERS */}
          {result.voiceovers?.voiceovers && result.voiceovers.voiceovers.length > 0 && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px' }}>🎤 Georgian Voiceovers ({result.voiceovers.voiceovers.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                {result.voiceovers.voiceovers.map((vo: any, idx: number) => (
                  <div key={idx} style={{ background: '#f0f9ff', borderRadius: '8px', padding: '15px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                      {vo.sceneId}
                    </div>
                    <div style={{ fontSize: '13px', color: '#444', marginBottom: '10px', fontStyle: 'italic' }}>
                      "{vo.text}"
                    </div>
                    {vo.audioUrl && (
                      <audio controls style={{ width: '100%' }} src={vo.audioUrl}>
                        Your browser does not support audio.
                      </audio>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ALL SCENE VIDEOS */}
          {result.videos && result.videos.length > 0 && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px' }}>🎞️ All Scenes ({result.videos.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {result.videos.map((render: any, idx: number) => (
                  <div key={idx} style={{ background: '#f9f9f9', borderRadius: '8px', padding: '15px' }}>
                    <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                      Scene: {render.sceneId}
                    </div>
                    <video
                      controls
                      style={{ width: '100%', borderRadius: '6px' }}
                      src={render.videoUrl}
                    />
                    <a
                      href={render.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '12px', color: '#3b82f6', display: 'block', marginTop: '10px' }}
                    >
                      Open in new tab →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOCALIZED TEXT */}
          {result.localized && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px' }}>🇬🇪 Georgian Translation</h3>
              <div style={{ background: '#fef3c7', padding: '20px', borderRadius: '8px' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                  {result.localized.title_ka}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {result.localized.logline_ka}
                </div>
              </div>
            </div>
          )}

          {/* PIPELINE TIMINGS */}
          {result.meta?.stageTimingsMs && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px' }}>⏱️ Pipeline Performance</h3>
              <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
                {Object.entries(result.meta.stageTimingsMs).map(([stage, ms]: [string, any]) => (
                  <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px' }}>{stage}</span>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>
                      {(ms / 1000).toFixed(2)}s
                    </span>
                  </div>
                ))}
                <div style={{ borderTop: '2px solid #ddd', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '16px', fontWeight: 'bold' }}>Total Time</span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#8b5cf6' }}>
                    {(Object.values(result.meta.stageTimingsMs).reduce((a: any, b: any) => a + b, 0) / 1000).toFixed(2)}s
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* DEBUG INFO */}
          <details style={{ marginTop: '30px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
              🔍 Full Pipeline Data
            </summary>
            <pre style={{
              background: '#f5f5f5',
              padding: '20px',
              borderRadius: '8px',
              overflow: 'auto',
              fontSize: '12px',
              marginTop: '10px',
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
            }
