/**
 * Google Calendar deletes triggered from the Notion webhook (jam: Notion **Cancelled** → delete).
 *
 * Treats **404** as success so duplicate webhook deliveries stay idempotent.
 */
import type { calendar_v3 } from "googleapis";

function isGoogleNotFoundError(err: unknown): boolean {
  const e = err as { code?: number; response?: { status?: number } };
  return e?.code === 404 || e?.response?.status === 404;
}

/**
 * Delete a single calendar event; **404** is treated as success.
 */
export async function deleteGoogleCalendarEventIdempotent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<{ deleted: boolean; alreadyGone: boolean }> {
  try {
    await calendar.events.delete({ calendarId, eventId });
    return { deleted: true, alreadyGone: false };
  } catch (err) {
    if (isGoogleNotFoundError(err)) {
      return { deleted: false, alreadyGone: true };
    }
    throw err;
  }
}
