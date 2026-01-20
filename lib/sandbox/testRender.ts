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

  // Start orchestration
  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setJobId(null);
    setStatus('');
    setTimeline(null);

    try {
      const response = await fetch('/api/v1/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test-user-123', // Sandbox mock user
          userPrompt: prompt,
          brandContext: {}
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.renderJobId) {
        setJobId(data.renderJobId);
        setStatus('queued');
        startPolling(data.renderJobId);
      } else {
        setError(data.error || 'Unknown error');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll job status
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

        // Stop polling on terminal states
        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling();
        }
      } catch (err: any) {
        setError(err.message);
        stopPolling();
      }
    }, 3000); // Poll every 3 seconds
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Avatar G - Sandbox Test UI</h1>
      <p style={{ color: '#666' }}>Environment: Sandbox | Shotstack Only</p>

      <div style={{ marginBottom: '20px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your video prompt..."
          rows={4}
          style={{ width: '100%', padding: '10px', fontSize: '14px' }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !!jobId}
          style={{
            marginTop: '10px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: loading || jobId ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Submitting...' : 'Generate Video'}
        </button>
      </div>

      {jobId && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5' }}>
          <h3>Job Status</h3>
          <p><strong>Job ID:</strong> {jobId}</p>
          <p><strong>Status:</strong> {status}</p>
          <p><strong>Progress:</strong> {Math.round(progress * 100)}%</p>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#ffe6e6', color: '#cc0000' }}>
          <h3>Error</h3>
          <pre>{error}</pre>
        </div>
      )}

      {timeline && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e6ffe6' }}>
          <h3>Shotstack Timeline (Ready)</h3>
          <pre style={{ overflow: 'auto', maxHeight: '300px', fontSize: '12px' }}>
            {JSON.stringify(timeline, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
    }
