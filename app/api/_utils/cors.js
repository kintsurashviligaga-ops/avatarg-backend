  // app/api/_utils/cors.js
const ALLOWED_ORIGINS = [
  "https://avatar-g.vercel.app",
  "http://localhost:3000",
];

function getOrigin(req) {
  return req.headers.get("origin") || "";
}

export function corsHeaders(req) {
  const origin = getOrigin(req);
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : "https://avatar-g.vercel.app";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export function corsPreflight(req) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(req),
    },
  });
}
