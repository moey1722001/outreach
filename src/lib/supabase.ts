import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_OUTREACH_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_OUTREACH_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR_OUTREACH_PROJECT_REF'));

export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
