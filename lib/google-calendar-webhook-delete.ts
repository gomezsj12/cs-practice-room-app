/**
 * Google Calendar deletes triggered from the Notion webhook (Notion status → Cancelled).
 *
 * Treats **404** as success so duplicate webhook deliveries stay idempotent.
 */
import type { calendar_v3 } from "googleapis";
import type { GoogleApiEvent } from "@/lib/types";
import {
  buildPracticeCustomEventIdFromGoogleEvent,
  buildPracticeCustomEventIdFromGoogleEventInTimeZone,
  parsePracticeCustomEventId,
  parsePracticeCustomEventIdAsRoomWallClock,
  practiceCustomEventIdsMatch,
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
/** Extra padding when UTC vs room-wall-clock parsing disagree (Fillout-style IDs). */
const PRACTICE_LIST_WIDE_PAD_MS = 26 * 60 * 60 * 1000;

function practiceEventMatchesCustomId(
  event: GoogleApiEvent,
  customEventId: string,
  roomTimeZone: string,
): boolean {
  const utcBuilt = buildPracticeCustomEventIdFromGoogleEvent(event);
  if (utcBuilt && practiceCustomEventIdsMatch(utcBuilt, customEventId)) {
    return true;
  }
  const zonedBuilt = buildPracticeCustomEventIdFromGoogleEventInTimeZone(
    event,
    roomTimeZone,
  );
  if (zonedBuilt && practiceCustomEventIdsMatch(zonedBuilt, customEventId)) {
    return true;
  }
  return false;
}

/**
 * List practice-calendar events overlapping the Custom Event ID window and delete
 * any whose derived ID matches `customEventId` (UTC or room-zone encoding).
 */
export async function deletePracticeCalendarEventsMatchingCustomId(
  calendar: calendar_v3.Calendar,
  practiceCalendarId: string,
  customEventId: string,
): Promise<{ deletedCount: number; alreadyGoneCount: number }> {
  const roomTz =
    typeof process !== "undefined" && process.env.ROOM_TIME_ZONE
      ? process.env.ROOM_TIME_ZONE
      : "America/Los_Angeles";

  const rangeUtc = parsePracticeCustomEventId(customEventId);
  const rangeRoom = parsePracticeCustomEventIdAsRoomWallClock(
    customEventId,
    roomTz,
  );

  const ranges = [rangeUtc, rangeRoom].filter(Boolean) as {
    start: Date;
    end: Date;
  }[];

  if (ranges.length === 0) {
    return { deletedCount: 0, alreadyGoneCount: 0 };
  }

  const instants = ranges.flatMap((r) => [r.start.getTime(), r.end.getTime()]);
  const spanMs = Math.max(...instants) - Math.min(...instants);
  const interpretationsDiffer =
    rangeUtc &&
    rangeRoom &&
    (Math.abs(rangeUtc.start.getTime() - rangeRoom.start.getTime()) > 60_000 ||
      Math.abs(rangeUtc.end.getTime() - rangeRoom.end.getTime()) > 60_000);

  const pad =
    interpretationsDiffer || spanMs > 6 * 60 * 60 * 1000
      ? PRACTICE_LIST_WIDE_PAD_MS
      : LIST_PAD_MS;

  const timeMin = new Date(Math.min(...instants) - pad).toISOString();
  const timeMax = new Date(Math.max(...instants) + pad).toISOString();

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

  const toDelete = items.filter(
    (item) =>
      (item as GoogleApiEvent).id &&
      practiceEventMatchesCustomId(item as GoogleApiEvent, customEventId, roomTz),
  );

  const deleteResults = await Promise.all(
    toDelete.map((item) =>
      deleteGoogleCalendarEventIdempotent(
        calendar,
        practiceCalendarId,
        (item as GoogleApiEvent).id!,
      ),
    ),
  );

  for (const result of deleteResults) {
    if (result.deleted) {
      deletedCount++;
    }
    if (result.alreadyGone) {
      alreadyGoneCount++;
    }
  }

  return { deletedCount, alreadyGoneCount };
}
