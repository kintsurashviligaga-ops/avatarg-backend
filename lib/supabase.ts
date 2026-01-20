import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export const supabase = (() => {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);

  return supabaseInstance;
})();
