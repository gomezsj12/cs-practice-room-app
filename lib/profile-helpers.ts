import { getSupabaseAdmin } from "@/lib/supabase";
import type { ProfileRow } from "@/lib/types";

/**
 * Resolves `profiles.display_name` for upserts/sync: Notion people **Name**
 * when non-empty, otherwise the Google OAuth `name`, otherwise `"Unknown"`.
 */
export function resolveProfileDisplayName(
  notionName: string | null | undefined,
  googleAccountName: string | null | undefined,
): string {
  const fromNotion = notionName?.trim() ?? "";
  if (fromNotion) return fromNotion;
  const fromGoogle = googleAccountName?.trim() ?? "";
  if (fromGoogle) return fromGoogle;
  return "Unknown";
}

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
  const trimmed = googleEmail.trim();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .ilike("google_email", trimmed)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ProfileRow | null) ?? null;
}
