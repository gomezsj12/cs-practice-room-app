/**
 * Detects Supabase/PostgREST errors caused by missing support_threads columns
 * from migration `20260412120000_support_soft_delete_and_admin_unread.sql`.
 * Used to fall back to legacy queries until the migration is applied.
 */
export function isMissingSupportSoftDeleteColumnsError(error: unknown): boolean {
  const msg = String(
    (error as { message?: string })?.message ??
      (error as { details?: string })?.details ??
      error,
  ).toLowerCase();
  if (!msg.includes("does not exist")) {
    return false;
  }
  return (
    msg.includes("hidden_from_user") ||
    msg.includes("hidden_from_admin") ||
    msg.includes("unread_for_admin") ||
    msg.includes("staff_replied_from_app")
  );
}
