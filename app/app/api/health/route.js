export async function GET() {
  return new Response(
    JSON.stringify({ status: "ok", service: "AvatarG Backend" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
