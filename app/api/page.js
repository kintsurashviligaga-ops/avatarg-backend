export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #06121a 0%, #0a2533 100%)",
        color: "white",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        textAlign: "center",
        padding: 32,
      }}
    >
      <div>
        <div
          style={{
            width: 80,
            height: 80,
            margin: "0 auto 24px",
            borderRadius: 20,
            background:
              "radial-gradient(circle at 30% 30%, rgba(34,211,238,0.9), rgba(59,130,246,0.7))",
            boxShadow: "0 12px 40px rgba(34,211,238,0.25)",
          }}
        />

        <h1
          style={{
            fontSize: 48,
            fontWeight: 800,
            marginBottom: 12,
            background: "linear-gradient(90deg, #22d3ee, #3b82f6)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Avatar G Backend
        </h1>

        <p style={{ opacity: 0.75, fontSize: 16, marginBottom: 32 }}>
          Next.js 14 API • OpenAI • Production Ready
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <a
            href="/api/health"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: 12,
              background: "linear-gradient(90deg, #22d3ee, #3b82f6)",
              color: "#06121a",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            🏥 Health Check
          </a>
        </div>

        <div style={{ marginTop: 48, opacity: 0.5, fontSize: 13 }}>
          © {new Date().getFullYear()} Avatar G
        </div>
      </div>
    </main>
  );
}
