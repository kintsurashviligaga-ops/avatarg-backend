import { corsHeaders } from "../_utils/cors";

export async function GET() {
  return new Response(
    JSON.stringify({ status: "ok" }),
    {
      status: 200,
      headers: corsHeaders,
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
