import { createClient } from '@supabase/supabase-js';

const outreachUrl = 'https://kfugipcvnorigweczzhv.supabase.co';
const outreachAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmdWdpcGN2bm9yaWd3ZWN6emh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjA1NTUsImV4cCI6MjA5Mzk5NjU1NX0.7k49MheurHhaTq-XXhlRKtRqcOJxNSHHZI0WQNXbf5w';

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
