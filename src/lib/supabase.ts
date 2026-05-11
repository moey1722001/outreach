import { createClient } from '@supabase/supabase-js';

const outreachUrl = 'https://kfugipcvnorigweczzhv.supabase.co';
const outreachAnonKey = 'sb_publishable_8_Da3387rO1H_ZZc1H4r9g_Nr4fQmCT';

const url = (import.meta.env.VITE_OUTREACH_SUPABASE_URL as string | undefined) || outreachUrl;
const anonKey = (import.meta.env.VITE_OUTREACH_SUPABASE_ANON_KEY as string | undefined) || outreachAnonKey;

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
