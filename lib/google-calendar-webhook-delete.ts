/**
 * Google Calendar deletes triggered from the Notion webhook (Notion status → Cancelled).
 *
 * Treats **404** as success so duplicate webhook deliveries stay idempotent.
 */
import type { calendar_v3 } from "googleapis";
import type { GoogleApiEvent } from "@/lib/types";
import {
  buildPracticeCustomEventIdFromGoogleEvent,
  parsePracticeCustomEventId,
} from "@/lib/practice-custom-event-id";

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

const LIST_PAD_MS = 60_000;

/**
 * List practice-calendar events overlapping the Custom Event ID window and delete
 * any whose {@link buildPracticeCustomEventIdFromGoogleEvent} matches `customEventId`.
 */
export async function deletePracticeCalendarEventsMatchingCustomId(
  calendar: calendar_v3.Calendar,
  practiceCalendarId: string,
  customEventId: string,
): Promise<{ deletedCount: number; alreadyGoneCount: number }> {
  const range = parsePracticeCustomEventId(customEventId);
  if (!range) {
    return { deletedCount: 0, alreadyGoneCount: 0 };
  }

  const timeMin = new Date(range.start.getTime() - LIST_PAD_MS).toISOString();
  const timeMax = new Date(range.end.getTime() + LIST_PAD_MS).toISOString();

  const listRes = await calendar.events.list({
    calendarId: practiceCalendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    maxResults: 250,
  });

  const items = listRes.data.items ?? [];
  let deletedCount = 0;
  let alreadyGoneCount = 0;

  for (const item of items) {
    const event = item as GoogleApiEvent;
    const built = buildPracticeCustomEventIdFromGoogleEvent(event);
    if (built !== customEventId || !event.id) {
      continue;
    }
    const result = await deleteGoogleCalendarEventIdempotent(
      calendar,
      practiceCalendarId,
      event.id,
    );
    if (result.deleted) {
      deletedCount++;
    }
    if (result.alreadyGone) {
      alreadyGoneCount++;
    }
  }

  return { deletedCount, alreadyGoneCount };
}
