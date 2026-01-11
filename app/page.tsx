"use client";

import { useState } from "react";

export default function Home() {
  const [chat, setChat] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage(messages: any[]) {
    setLoading(true);
    setChat("");

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/chat/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      }
    );

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      setChat((prev) => prev + decoder.decode(value));
    }

    setLoading(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 800 }}>
      <h1>🤖 Avatar G – Live Chat</h1>

      <div
        style={{
          minHeight: 200,
          background: "#0b1220",
          color: "#4dfcff",
          padding: 12,
          borderRadius: 8,
          whiteSpace: "pre-wrap",
          marginBottom: 12,
        }}
      >
        {chat || "დაწერე შეტყობინება 👇"}
        {loading && <span className="cursor">▍</span>}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="მკითხე რამე Avatar G-ს..."
        rows={3}
        style={{ width: "100%", padding: 10 }}
      />

      <button
        onClick={() =>
          sendMessage([{ role: "user", content: input }])
        }
        style={{ marginTop: 10 }}
      >
        Send
      </button>
    </main>
  );
}
