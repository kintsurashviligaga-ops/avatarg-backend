export async function GET() {
  return Response.json({
    ok: true,
    service: "Avatar G Backend",
    timestamp: new Date().toISOString()
  });
}
