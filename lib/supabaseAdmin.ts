// lib/supabaseAdmin.ts
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

declare global {
  // Prevent multiple instances in dev / HMR
  // eslint-disable-next-line no-var
  var __supabaseAdmin: SupabaseClient | undefined;
}

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function resolveSupabaseUrl() {
  return (
    getEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    getEnv("VITE_SUPABASE_URL") ||
    getEnv("SUPABASE_URL")
  );
}

function resolveServiceRoleKey() {
  return getEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabaseAdmin(): SupabaseClient {
  if (global.__supabaseAdmin) return global.__supabaseAdmin;

  const supabaseUrl = resolveSupabaseUrl();
  const serviceRoleKey = resolveServiceRoleKey();

  if (!supabaseUrl) {
    throw new Error(
      "Missing Supabase URL env var. Set one of: NEXT_PUBLIC_SUPABASE_URL, VITE_SUPABASE_URL, SUPABASE_URL"
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY env var (server-only). Do NOT expose this to the client."
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      // Optional: add a tag for logs/diagnostics
      headers: { "X-Client-Info": "avatar-g/supabase-admin" },
    },
  });

  global.__supabaseAdmin = client;
  return client;
}

// ✅ Default export style used by most server files
export const supabaseAdmin = getSupabaseAdmin();
