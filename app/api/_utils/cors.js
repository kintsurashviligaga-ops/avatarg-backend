// app/api/_utils/cors.js

/**
 * CORS helpers for Next.js App Router route handlers.
 * DEV MODE: allows all origins (*). Good until you buy a domain.
 */

export function getCorsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Accept, Origin",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function withCors(req, extraHeaders = {}) {
  return { ...getCorsHeaders(req), ...extraHeaders };
}

export function corsPreflight(req) {
  return new Response(null, {
    status: 204,
    headers: withCors(req),
  });
}

export function json(req, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors(req, {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    }),
  });
}
