import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

function createAdminClient(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin environment variables: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return adminClient;
}

// Export as getter function to avoid build-time initialization
export const getSupabaseAdmin = (): SupabaseClient => {
  return createAdminClient();
};

// Legacy export for backward compatibility
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const client = createAdminClient();
    return (client as any)[prop];
  }
});
