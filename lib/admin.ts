/**
 * @file Admin-role helpers.
 *
 * Admin status is determined solely by the `ADMIN_EMAILS` environment
 * variable (comma-separated Google email addresses). These helpers are
 * used at profile-creation time, in the JWT callback, and by API routes
 * that gate admin-only behaviour.
 *
 * @see {@link @/auth} — JWT callback that sets `token.isAdmin`
 * @see {@link @/app/api/profile/setup/route} — sets `is_admin` column
 */

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
