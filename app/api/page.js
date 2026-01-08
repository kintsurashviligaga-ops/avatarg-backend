export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1220",
        color: "white",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: 42, margin: 0, marginBottom: 12 }}>
          Avatar G Backend 🚀
        </h1>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          Next.js API • OpenAI • Supabase • Stripe
        </p>

        <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/api/health"
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              background: "#22d3ee",
              color: "#001018",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Health Check
          </a>

          <a
            href="https://vercel.com"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.2)",
              color: "white",
              textDecoration: "none",
            }}
          >
            Hosted on Vercel
          </a>
        </div>

        <p style={{ opacity: 0.6, marginTop: 20, fontSize: 13 }}>
          © {new Date().getFullYear()} Avatar G
        </p>
      </div>
    </main>
  );
}
