"use client";

import React, { useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type ChatMsg = { role: Role; content: string };

const API_BASE_FALLBACK = "https://avatarg-backend.vercel.app";

export default function Home() {
  const API_BASE = useMemo(() => {
    return process.env.NEXT_PUBLIC_API_BASE_URL || API_BASE_FALLBACK;
  }, []);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setInput("");

    // 1) add user msg
    const nextMsgs: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);

    // 2) add empty assistant msg that we will stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMsgs }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t || "Request failed"}`);
      }

      if (!res.body) {
        throw new Error("No response body (stream not supported).");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        // append chunk to last assistant message
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last.role !== "assistant") return prev;
          copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // user pressed stop
      } else {
        setError(e?.message || "Unknown error");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>🤖 Avatar G — Live Chat</h1>

      <div
        style={{
          border: "1px solid #1f2937",
          borderRadius: 14,
          padding: 16,
          background: "#0b1220",
          color: "#9ee6ff",
          minHeight: 240,
          whiteSpace: "pre-wrap",
          overflow: "auto",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ opacity: 0.85 }}>დაწერე შეტყობინება 👇</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <strong style={{ color: m.role === "user" ? "#ffffff" : "#9ee6ff" }}>
                {m.role === "user" ? "You: " : "Avatar G: "}
              </strong>
              <span style={{ color: m.role === "user" ? "#e5e7eb" : "#9ee6ff" }}>
                {m.content}
              </span>
            </div>
          ))
        )}
      </div>

      {error && (
        <div style={{ marginTop: 10, color: "#ff6b6b" }}>
          ❌ {error}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="მკითხე რამე Avatar G-ს..."
          rows={3}
          style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #cbd5e1" }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: streaming ? "#334155" : "#111827",
              color: "white",
              cursor: streaming ? "not-allowed" : "pointer",
            }}
          >
            {streaming ? "Sending..." : "Send"}
          </button>

          <button
            onClick={stop}
            disabled={!streaming}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ef4444",
              background: streaming ? "#ef4444" : "#fecaca",
              color: streaming ? "white" : "#7f1d1d",
              cursor: streaming ? "pointer" : "not-allowed",
            }}
          >
            Stop
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
        API Base: <code>{API_BASE}</code>
      </div>
    </main>
  );
              }
