// app/page.tsx
import VideoDashboard from "@/components/VideoDashboard";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#07020f] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="mr-2">🎬</span> Avatar G — AI Pentagon Video Generator
          </h1>
          <p className="mt-2 text-sm text-white/70">
            Structure → Edit → Georgian Localization → Voiceover → Visuals (Pexels) → Render
          </p>
        </header>

        <VideoDashboard />
      </div>
    </main>
  );
}
