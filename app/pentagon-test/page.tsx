'use client';

import { useState } from 'react';

export default function PentagonTestPage() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('გთხოვთ შეიყვანოთ პრომპტი');
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
          maxDurationSec: 120,
          style: 'cinematic, professional, high-quality',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Unknown error');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
      color: '#f1f5f9',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1 style={{ 
            fontSize: '42px', 
            fontWeight: '700', 
            marginBottom: '12px',
            background: 'linear-gradient(to right, #60a5fa, #a78bfa, #f472b6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Pentagon AI Pipeline
          </h1>
          <p style={{ fontSize: '18px', color: '#94a3b8', marginBottom: '8px' }}>
            5-Stage AI Video Production System
          </p>
          <div style={{ fontSize: '14px', color: '#64748b' }}>
            DeepSeek → GPT → Gemini → Grok → Pollinations
          </div>
        </div>

        {/* Input Section */}
        <div style={{ 
          background: '#1e293b',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '24px',
          border: '1px solid #334155'
        }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '12px', 
            fontSize: '16px',
            fontWeight: '600'
          }}>
            ვიდეოს პრომპტი
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="მაგ: შექმენი 15-წამიანი ვიდეო ქართული მთების შესახებ"
            rows={4}
            style={{ 
              width: '100%', 
              padding: '16px',
              fontSize: '15px',
              background: '#0f172a',
              border: '2px solid #334155',
              borderRadius: '12px',
              color: '#f1f5f9',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              marginTop: '16px',
              padding: '14px 32px',
              fontSize: '16px',
              fontWeight: '600',
              background: loading ? '#475569' : 'linear-gradient(to right, #3b82f6, #8b5cf6, #f472b6)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%',
              transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳ მუშავდება AI Pipeline-ში...' : '🚀 Pentagon Pipeline გაშვება'}
          </button>
        </div>

        {/* Error Section */}
        {error && (
          <div style={{ 
            background: '#7f1d1d',
            border: '2px solid #991b1b',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <h3 style={{ marginBottom: '12px', fontSize: '18px' }}>
              ❌ შეცდომა
            </h3>
            <pre style={{ 
              fontSize: '13px',
              background: '#450a0a',
              padding: '12px',
              borderRadius: '8px',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {error}
            </pre>
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div style={{ display: 'grid', gap: '24px' }}>
            {/* Stage 1: DeepSeek */}
            <details open style={{ 
              background: '#1e293b',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #334155'
            }}>
              <summary style={{ 
                fontSize: '18px', 
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '16px',
                color: '#60a5fa'
              }}>
                🤖 Stage 1: DeepSeek (Structure)
              </summary>
              <pre style={{ 
                background: '#0f172a',
                padding: '16px',
                borderRadius: '8px',
                fontSize: '13px',
                overflow: 'auto',
                margin: 0
              }}>
                {JSON.stringify(result.deepseek, null, 2)}
              </pre>
            </details>

            {/* Stage 2: GPT */}
            <details style={{ 
              background: '#1e293b',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #334155'
            }}>
              <summary style={{ 
                fontSize: '18px', 
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '16px',
                color: '#8b5cf6'
              }}>
                ✏️ Stage 2: GPT (Editing)
              </summary>
              <pre style={{ 
                background: '#0f172a',
                padding: '16px',
                borderRadius: '8px',
                fontSize: '13px',
                overflow: 'auto',
                margin: 0
              }}>
                {JSON.stringify(result.gpt, null, 2)}
              </pre>
            </details>

            {/* Stage 3: Gemini */}
            <details style={{ 
              background: '#1e293b',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #334155'
            }}>
              <summary style={{ 
                fontSize: '18px', 
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '16px',
                color: '#f472b6'
              }}>
                🇬🇪 Stage 3: Gemini (Georgian Localization)
              </summary>
              <pre style={{ 
                background: '#0f172a',
                padding: '16px',
                borderRadius: '8px',
                fontSize: '13px',
                overflow: 'auto',
                margin: 0
              }}>
                {JSON.stringify(result.gemini, null, 2)}
              </pre>
            </details>

            {/* Stage 4: Grok */}
            <details style={{ 
              background: '#1e293b',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #334155'
            }}>
              <summary style={{ 
                fontSize: '18px', 
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '16px',
                color: '#fbbf24'
              }}>
                🎨 Stage 4: Grok (Visual Prompts)
              </summary>
              <pre style={{ 
                background: '#0f172a',
                padding: '16px',
                borderRadius: '8px',
                fontSize: '13px',
                overflow: 'auto',
                margin: 0
              }}>
                {JSON.stringify(result.grok, null, 2)}
              </pre>
            </details>

            {/* Stage 5: Pollinations */}
            <details open style={{ 
              background: '#1e293b',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #334155'
            }}>
              <summary style={{ 
                fontSize: '18px', 
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '16px',
                color: '#4ade80'
              }}>
                🖼️ Stage 5: Pollinations (Images)
              </summary>
              <div style={{ display: 'grid', gap: '16px' }}>
                {result.pollinations.map((render: any, idx: number) => (
                  <div key={idx} style={{
                    background: '#0f172a',
                    padding: '16px',
                    borderRadius: '8px'
                  }}>
                    <div style={{ 
                      fontSize: '14px', 
                      color: '#94a3b8',
                      marginBottom: '8px'
                    }}>
                      Scene: {render.sceneId}
                    </div>
                    <a 
                      href={render.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{
                        color: '#60a5fa',
                        fontSize: '13px',
                        wordBreak: 'break-all'
                      }}
                    >
                      {render.url}
                    </a>
                  </div>
                ))}
              </div>
            </details>

            {/* Meta Info */}
            <div style={{ 
              background: '#1e293b',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #334155'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
                ⏱️ Pipeline Timings
              </h3>
              <div style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.8' }}>
                <div>Request ID: <code style={{ color: '#60a5fa' }}>{result.requestId}</code></div>
                <div>Started: {new Date(result.meta.startedAt).toLocaleString()}</div>
                <div>Finished: {new Date(result.meta.finishedAt).toLocaleString()}</div>
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #334155' }}>
                  {Object.entries(result.meta.stageTimingsMs).map(([stage, ms]: [string, any]) => (
                    <div key={stage}>
                      {stage}: <strong>{ms}ms</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
            }
