import { getSupabaseAdmin } from "@/lib/supabase";
import type { ProfileRow } from "@/lib/types";

/**
 * Loads the signed-in user's profile row by their Google account email.
 *
 * Returns `null` when no profile exists yet. Supabase errors are re-thrown so
 * callers can decide whether to fail hard or degrade gracefully.
 */
export async function getProfileByGoogleEmail(
  googleEmail: string,
): Promise<ProfileRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("google_email", googleEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ProfileRow | null) ?? null;
}
