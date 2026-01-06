import { corsHeaders } from "../_utils/cors";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  return new Response(
    JSON.stringify({
      ok: true,
      message: "AI endpoint ready",
      input: body,
    }),
    { status: 200, headers: corsHeaders }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
