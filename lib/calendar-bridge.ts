/**
 * @file Sister-app bridge auth (dalin.calendar).
 *
 * A trusted sister app presents `Authorization: Bearer
 * <CALENDAR_BRIDGE_SECRET>` together with an `adminEmail` query param, and
 * the request is treated as coming from that email IF it appears in
 * `ADMIN_EMAILS`. Used by `GET /api/events` (to attach admin tags) and by
 * `PUT`/`DELETE /api/admin-event-tags` (to change them).
 *
 * Notion-Leadership admins are intentionally NOT honored via the bridge.
 * Only env-listed admins are, to keep the trust path simple.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { isAdminEmail } from "@/lib/admin";

function sameSecret(presented: string, expected: string): boolean {
  // Hash both sides so the comparison is constant-time whatever the lengths.
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Returns the bridged admin email (lowercased), or `null` when the request is
 * not a valid bridge call: no secret configured, a wrong or missing bearer, or
 * a claimed email that is not on `ADMIN_EMAILS`.
 */
export function resolveBridgeAdminEmail(request: Request): string | null {
  const secret = process.env.CALENDAR_BRIDGE_SECRET;
  if (!secret) return null;
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !sameSecret(authHeader, `Bearer ${secret}`)) return null;
  const claimed = new URL(request.url).searchParams.get("adminEmail");
  if (!claimed || !isAdminEmail(claimed)) return null;
  return claimed.trim().toLowerCase();
}
