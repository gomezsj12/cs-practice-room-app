/**
 * Supabase admin client factory (server-side only).
 *
 * Uses the `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS, so this must never
 * be imported in client bundles. The client is lazily created and reused
 * for the lifetime of the server process.
 *
 * @see {@link ../lib/types.ts} for row types consumed alongside this client.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** Singleton: created on first call, reused for the lifetime of the process. */
let _client: SupabaseClient | null = null;

/**
 * Return a Supabase admin client with service-role privileges.
 *
 * Auto-refresh and session persistence are disabled because this client
 * operates outside any user auth context.
 */
export function getSupabaseAdmin() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !secretKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    _client = createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return _client;
}