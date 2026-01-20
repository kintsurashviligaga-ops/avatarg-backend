'use client';

import { useState, useEffect, useRef } from 'react';

export default function SandboxTestUI() {
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [timeline, setTimeline] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('გთხოვთ შეიყვანოთ პრომპტი');
      return;
    }

    setLoading(true);
    setError(null);
    setJobId(null);
    setStatus('');
    setTimeline(null);
    setProgress(0);

    try {
      const response = await fetch('/api/v1/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '00000000-0000-0000-0000-000000000001',
          userPrompt: prompt,
          brandContext: {}
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.jobId) {
        setJobId(data.jobId);
        setStatus('queued');
        startPolling(data.jobId);
      } else {
        setError(data.error || 'Unknown error');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (id: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/orchestrate?jobId=${id}`);
        if (!response.ok) {
          throw new Error(`Polling failed: ${response.status}`);
        }

        const data = await response.json();

        setStatus(data.status || 'unknown');
        setProgress(data.progress || 0);

        if (data.shotstack?.timelineJson) {
          setTimeline(data.shotstack.timelineJson);
        }

        if (data.error) {
          setError(`${data.error.code}: ${data.error.message}`);
          stopPolling();
        }

        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling();
        }
      } catch (err: any) {
        setError(err.message);
        stopPolling();
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const getStatusColor = (currentStatus: string) => {
    switch (currentStatus) {
      case 'completed': return '#4ade80';
      case 'failed': return '#f87171';
      case 'running': return '#60a5fa';
      case 'waiting_provider': return '#fbbf24';
      default: return '#94a3b8';
    }
  };

  const getStatusText = (currentStatus: string) => {
    const statusMap: Record<string, string> = {
      'queued': 'რიგში დგას',
      'running': 'მუშავდება',
      'waiting_provider': 'Shotstack-ზე იგზავნება',
      'completed': 'დასრულებულია',
      'failed': 'შეცდომა',
      'canceled': 'გაუქმებულია'
    };
    return statusMap[currentStatus] || currentStatus;
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
      color: '#f1f5f9',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1 style={{ 
            fontSize: '42px', 
            fontWeight: '700', 
            marginBottom: '12px',
            background: 'linear-gradient(to right, #60a5fa, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Avatar G
          </h1>
          <p style={{ fontSize: '18px', color: '#94a3b8' }}>
            Sandbox Testing Environment
          </p>
          <div style={{ 
            display: 'inline-block',
            marginTop: '12px',
            padding: '6px 16px',
            background: '#1e293b',
            borderRadius: '20px',
            fontSize: '14px',
            border: '1px solid #334155'
          }}>
            🧪 Shotstack Sandbox Mode
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
            disabled={loading || !!jobId}
            style={{
              marginTop: '16px',
              padding: '14px 32px',
              fontSize: '16px',
              fontWeight: '600',
              background: loading || jobId ? '#475569' : 'linear-gradient(to right, #3b82f6, #8b5cf6)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              cursor: loading || jobId ? 'not-allowed' : 'pointer',
              width: '100%',
              transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳ იგზავნება...' : jobId ? '✅ დავალება გაგზავნილია' : '🚀 ვიდეოს გენერაცია'}
          </button>
        </div>

        {/* Status Section */}
        {jobId && (
          <div style={{ 
            background: '#1e293b',
            borderRadius: '16px',
            padding: '32px',
            marginBottom: '24px',
            border: '1px solid #334155'
          }}>
            <h3 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>
              📊 სტატუსი
            </h3>
            
            <div style={{ marginBottom: '20px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: '8px',
                fontSize: '14px',
                color: '#94a3b8'
              }}>
                <span>Job ID:</span>
                <code style={{ 
                  background: '#0f172a',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}>
                  {jobId.substring(0, 8)}...
                </code>
              </div>
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#94a3b8'
              }}>
                <span>სტატუსი:</span>
                <span style={{ 
                  color: getStatusColor(status),
                  fontWeight: '600'
                }}>
                  {getStatusText(status)}
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ 
                background: '#0f172a',
                borderRadius: '10px',
                height: '12px',
                overflow: 'hidden',
                marginBottom: '8px'
              }}>
                <div style={{ 
                  background: `linear-gradient(to right, ${getStatusColor(status)}, ${getStatusColor(status)}dd)`,
                  height: '100%',
                  width: `${Math.round(progress * 100)}%`,
                  transition: 'width 0.5s ease'
                }} />
              </div>
              <div style={{ 
                textAlign: 'right',
                fontSize: '13px',
                color: '#64748b'
              }}>
                {Math.round(progress * 100)}%
              </div>
            </div>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div style={{ 
            background: '#7f1d1d',
            border: '2px solid #991b1b',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <h3 style={{ marginBottom: '12px', fontSize: '18px', display: 'flex', alignItems: 'center' }}>
              ❌ შეცდომა
            </h3>
            <pre style={{ 
              overflow: 'auto',
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

        {/* Timeline Section */}
        {timeline && (
          <div style={{ 
            background: '#1e293b',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid #334155'
          }}>
            <h3 style={{ marginBottom: '16px', fontSize: '20px', fontWeight: '600' }}>
              ✅ Shotstack Timeline (მზადაა)
            </h3>
            <div style={{ 
              background: '#0f172a',
              borderRadius: '12px',
              padding: '20px',
              overflow: 'auto',
              maxHeight: '400px'
            }}>
              <pre style={{ 
                fontSize: '13px',
                margin: 0,
                color: '#94a3b8',
                lineHeight: '1.6'
              }}>
                {JSON.stringify(timeline, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
