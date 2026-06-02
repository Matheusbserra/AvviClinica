import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const cleanSupabaseUrl = supabaseUrl
  ?.trim()
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/auth\/v1\/?$/i, "")
  .replace(/\/+$/g, "");

export const isSupabaseConfigured = Boolean(cleanSupabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(cleanSupabaseUrl!, supabaseAnonKey!.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: typeof window !== "undefined" ? window.sessionStorage : undefined
      }
    })
  : null;
