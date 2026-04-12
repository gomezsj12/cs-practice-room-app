/**
 * @file Booking and Notion-type access helpers (client-safe, no env reads).
 *
 * Booking access requires a linked people row and a Type that grants booking.
 * App admin beyond ADMIN_EMAILS uses Notion Type Leadership (see isEffectiveAppAdmin
 * in admin.ts).
 */

/** Notion select value that grants in-app admin (in addition to ADMIN_EMAILS). */
export const NOTION_TYPE_LEADERSHIP = "Leadership";

const NOTION_TYPES_BOOKING = new Set<string>([
  NOTION_TYPE_LEADERSHIP,
  "Dept Sound Leader",
  "Tech",
  "Training",
  "Dept Manager",
  "Scheduler",
]);

export function normalizeNotionType(type: string | null | undefined): string | null {
  if (type == null) return null;
  const t = type.trim();
  return t.length > 0 ? t : null;
}

export function notionTypeGrantsBookingAccess(type: string | null | undefined): boolean {
  const t = normalizeNotionType(type);
  return t != null && NOTION_TYPES_BOOKING.has(t);
}

export function notionTypeGrantsLeadershipAdmin(type: string | null | undefined): boolean {
  return normalizeNotionType(type) === NOTION_TYPE_LEADERSHIP;
}

export function profileHasBookingAccess(
  notionPageId: string | null | undefined,
  type: string | null | undefined,
): boolean {
  return Boolean(notionPageId) && notionTypeGrantsBookingAccess(type);
}
