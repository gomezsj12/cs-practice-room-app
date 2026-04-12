/**
 * @file Admin-role helpers.
 *
 * Effective app admin is: Google email listed in `ADMIN_EMAILS`, **or**
 * the user's synced Notion people **Type** is {@link NOTION_TYPE_LEADERSHIP}.
 * API routes should use {@link isAppAdmin} so Leadership is honored; the JWT
 * callback applies the same rule. `profiles.is_admin` is a mirror of this for
 * Supabase visibility and is updated on profile sync.
 *
 * @see {@link @/auth} — JWT callback that sets `token.isAdmin`
 * @see {@link @/lib/profile-access} — Notion type constants and booking access
 */

import { notionTypeGrantsLeadershipAdmin } from "@/lib/profile-access";
import { getProfileByGoogleEmail } from "@/lib/profile-helpers";

/**
 * Returns the set of admin Google emails from the `ADMIN_EMAILS` env var.
 * Each entry is lowercased and trimmed; empty/whitespace-only entries are
 * dropped.
 */
export function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Returns `true` when the given email appears in the `ADMIN_EMAILS` env
 * var. The comparison is case-insensitive.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.trim().toLowerCase());
}

/**
 * True when the user should have admin UI and admin API access: env list or
 * Notion Leadership on their profile row.
 */
export function isEffectiveAppAdmin(
  googleEmail: string | null | undefined,
  notionType: string | null | undefined,
): boolean {
  return (
    isAdminEmail(googleEmail) || notionTypeGrantsLeadershipAdmin(notionType)
  );
}

/**
 * Server-side admin check for API routes: env list or Leadership on the
 * user's profile (after Notion sync).
 */
export async function isAppAdmin(
  googleEmail: string | null | undefined,
): Promise<boolean> {
  if (!googleEmail) return false;
  if (isAdminEmail(googleEmail)) return true;
  const profile = await getProfileByGoogleEmail(googleEmail);
  return notionTypeGrantsLeadershipAdmin(profile?.type ?? null);
}
