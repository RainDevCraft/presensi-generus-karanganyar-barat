import {createClient, type SupabaseClient} from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY) as string | undefined;

const isPlaceholderUrl =
  !supabaseUrl ||
  supabaseUrl.includes('YOUR_PROJECT_ID') ||
  !supabaseUrl.startsWith('https://');

const isPlaceholderKey =
  !supabaseAnonKey ||
  supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY') ||
  supabaseAnonKey.length < 20;

export const isSupabaseConfigured = !isPlaceholderUrl && !isPlaceholderKey;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
