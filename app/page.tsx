"use client";

import React, { useMemo, useRef, useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };

const API_BASE_FALLBACK = "https://avatarg-backend.vercel.app";

export default function Home() {
  const API_BASE = useMemo(() => {
    return process.env.NEXT_PUBLIC_API_BASE_URL || API_BASE_FALLBACK;
  }, []);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");

    // 1) add user msg
    const nextMessages: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);

    // 2) add empty assistant msg (will fill while streaming)
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errText || "Request failed"}`);
      }

      if (!res.body) throw new Error("No response body (stream not supported).");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // append chunk to last assistant message
        setMessages((prev) => {
          const copy = [...prev];
          const lastIndex = copy.length - 1;
          if (lastIndex >= 0 && copy[lastIndex].role === "assistant") {
            copy[lastIndex] = {
              ...copy[lastIndex],
              content: copy[lastIndex].content + chunk,
            };
          }
          return copy;
        });
      }
    } catch (e: any) {
      setMessages((prev) => {
        const copy = [...prev];
        const lastIndex = copy.length - 1;
        const msg = `⚠️ Error: ${e?.message ?? String(e)}`;
        if (lastIndex >= 0 && copy[lastIndex].role === "assistant") {
          copy[lastIndex] = { ...copy[lastIndex], content: msg };
        } else {
          copy.push({ role: "assistant", content: msg });
        }
        return copy;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 920, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>🤖 Avatar G — Live Chat</h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>
        Streaming UI (real-time). API: <code>{API_BASE}</code>
      </p>

      <div
        style={{
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.15)",
          padding: 16,
          minHeight: 260,
          background: "#0b1220",
          color: "#9ee7ff",
          whiteSpace: "pre-wrap",
          overflow: "auto",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ opacity: 0.7 }}>დაწერე შეტყობინება 👇</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: m.role === "user" ? "#ffffff" : "#7ee1ff" }}>
                {m.role === "user" ? "You" : "Avatar G"}
              </div>
              <div>{m.content}</div>
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="მიწერე რამე Avatar G-ს..."
          style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          disabled={streaming}
        />

        <button
          onClick={send}
          disabled={streaming}
          style={{ padding: "12px 16px", borderRadius: 10, cursor: streaming ? "not-allowed" : "pointer" }}
        >
          {streaming ? "Sending..." : "Send"}
        </button>

        <button
          onClick={stop}
          disabled={!streaming}
          style={{ padding: "12px 16px", borderRadius: 10, cursor: !streaming ? "not-allowed" : "pointer" }}
        >
          Stop
        </button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => setMessages([])}
          style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer" }}
        >
          Clear
        </button>
        <button
          onClick={() => {
            setInput("გამარჯობა Avatar G, რას აკეთებ?");
          }}
          style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer" }}
        >
          Demo prompt
        </button>
      </div>
    </main>
  );
}
