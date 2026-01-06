export default function HomePage() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0f172a",
      color: "white",
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      padding: "40px"
    }}>
      <div>
        <h1 style={{ fontSize: "48px", marginBottom: "16px" }}>
          Avatar G Backend 🚀
        </h1>

        <p style={{ fontSize: "18px", opacity: 0.8 }}>
          Next.js API · OpenAI · Supabase · Stripe
        </p>

        <div style={{ marginTop: "32px" }}>
          <a
            href="/api/health"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              background: "#22d3ee",
              color: "#020617",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "600"
            }}
          >
            Health Check
          </a>
        </div>

        <p style={{ marginTop: "40px", fontSize: "14px", opacity: 0.5 }}>
          © {new Date().getFullYear()} Avatar G
        </p>
      </div>
    </main>
  );
              }
