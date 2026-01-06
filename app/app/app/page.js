export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "system-ui, Arial" }}>
      <h1>Avatar G Backend ✅</h1>
      <p>Backend is running correctly.</p>
      <p>
        Health check: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
