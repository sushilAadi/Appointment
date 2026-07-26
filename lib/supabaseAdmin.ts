import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the SECRET service_role key, which
// bypasses Row Level Security entirely. Never import this file from a
// Client Component or expose SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_
// prefix — it grants full read/write access to the database.

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set"
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
