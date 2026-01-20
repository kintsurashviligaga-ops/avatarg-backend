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
          maxScenes: 5,
          maxDurationSec: 90,
          style: 'cinematic, professional, 4K, beautiful lighting',
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
        DeepSeek → GPT-4o → Gemini → Grok → Pollinations AI
      </p>

      <div style={{ marginBottom: '20px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your video idea (e.g., 'Create a cinematic video about Georgian mountains')"
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
        <div style={{ background: '#fee', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div>
          <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>✅ Video Generated!</h2>

          {/* VIDEO PLAYER */}
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

          {/* ALL SCENE VIDEOS */}
          <h3 style={{ fontSize: '20px', marginBottom: '15px' }}>🎞️ All Scenes ({result.pollinations.length})</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            {result.pollinations.map((render: any, idx: number) => (
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
