'use client';

import { useState } from 'react';

export default function APITestPage() {
  const [deepseekResult, setDeepseekResult] = useState<string>('');
  const [geminiResult, setGeminiResult] = useState<string>('');
  const [testing, setTesting] = useState(false);

  const testAPIs = async () => {
    setTesting(true);
    setDeepseekResult('⏳ ტესტირდება...');
    setGeminiResult('⏳ ტესტირდება...');

    // Test DeepSeek
    try {
      const response = await fetch('/api/test-deepseek');
      const data = await response.json();
      
      if (data.success) {
        setDeepseekResult(`✅ მუშაობს!\n\n${data.response}`);
      } else {
        setDeepseekResult(`❌ შეცდომა:\n\n${data.error}`);
      }
    } catch (error: any) {
      setDeepseekResult(`❌ შეცდომა:\n\n${error.message}`);
    }

    // Test Gemini
    try {
      const response = await fetch('/api/test-gemini');
      const data = await response.json();
      
      if (data.success) {
        setGeminiResult(`✅ მუშაობს!\n\n${data.response}`);
      } else {
        setGeminiResult(`❌ შეცდომა:\n\n${data.error}`);
      }
    } catch (error: any) {
      setGeminiResult(`❌ შეცდომა:\n\n${error.message}`);
    }

    setTesting(false);
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
      color: '#f1f5f9',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ 
          fontSize: '32px', 
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          API Test Page
        </h1>

        <button
          onClick={testAPIs}
          disabled={testing}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '18px',
            fontWeight: '600',
            background: testing ? '#475569' : 'linear-gradient(to right, #3b82f6, #8b5cf6)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            marginBottom: '30px',
            cursor: testing ? 'not-allowed' : 'pointer'
          }}
        >
          {testing ? '⏳ ტესტირება...' : '🧪 API-ების ტესტირება'}
        </button>

        {/* DeepSeek Results */}
        <div style={{
          background: '#1e293b',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
          border: '1px solid #334155'
        }}>
          <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>
            🤖 DeepSeek API
          </h2>
          <pre style={{
            background: '#0f172a',
            padding: '16px',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '14px',
            minHeight: '80px'
          }}>
            {deepseekResult || 'დააჭირე ღილაკს ტესტირებისთვის'}
          </pre>
        </div>

        {/* Gemini Results */}
        <div style={{
          background: '#1e293b',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #334155'
        }}>
          <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>
            ✨ Gemini API
          </h2>
          <pre style={{
            background: '#0f172a',
            padding: '16px',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '14px',
            minHeight: '80px'
          }}>
            {geminiResult || 'დააჭირე ღილაკს ტესტირებისთვის'}
          </pre>
        </div>
      </div>
    </div>
  );
            }
