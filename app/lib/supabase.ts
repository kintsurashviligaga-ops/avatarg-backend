import { createClient } from "@supabase/supabase-js";

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// SERVER-ONLY helper (use ONLY in backend / route.ts / worker)
// Do NOT import this into client components!
export const supabaseAdmin = () =>
  createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    }
  );
