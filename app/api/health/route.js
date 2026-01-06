export const runtime = "edge";

export function GET() {
  return new Response(
    JSON.stringify({ status: "ok" }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}
