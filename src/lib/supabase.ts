import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase client. URL + anon key are inlined at build time from .env.
//
// NOTE on security: the anon key ships inside the app. For a private 2-person
// tool this is fine (private-by-obscurity behind the shared passphrase). To
// tighten later, enable Row Level Security in Supabase and add policies — see
// the "Hardening" section of the README. RLS is enforced server-side, so even
// with the anon key exposed, only allowed rows would be readable/writable.
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes("YOUR-PROJECT"));

// Create a real client when configured; otherwise leave null so the app can
// still boot (useful for trying the scheduler before Supabase is set up).
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

export const SHARED_PASSPHRASE = (import.meta.env.VITE_SHARED_PASSPHRASE as string | undefined) ?? "";
