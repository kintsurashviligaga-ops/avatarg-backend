export async function GET() {
  return Response.json({
    ok: true,
    service: "avatarg-backend",
    time: new Date().toISOString()
  });
}
