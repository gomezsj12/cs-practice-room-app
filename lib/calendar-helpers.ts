/** Shared helpers for calendar overlap detection and booking validation. */

import type { calendar_v3 } from "googleapis";
import {
  SNAP_MINUTES,
  MIN_BOOKING_MS,
  MAX_BOOKING_MS,
  parseSlotTimeToMinutes,
  SLOT_MIN_STR,
} from "@/lib/timeGridDragSelect";
import type { GoogleApiEvent } from "@/lib/types";

/** Wall-clock components in a specific IANA time zone (no offset info). */
export type ZonedYmdhm = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/**
 * Decompose a UTC `Date` into wall-clock year/month/day/hour/minute
 * as seen by a clock in `timeZone`. Uses `Intl.DateTimeFormat` so no
 * heavy timezone library is needed.
 */
export function getZonedCalendarParts(date: Date, timeZone: string): ZonedYmdhm {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = Number(p.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
  };
}

/** Compare two zoned date-parts by calendar day only. Negative → a before b. */
function compareZonedCalendarDays(a: ZonedYmdhm, b: ZonedYmdhm): number {
  const ak = a.year * 10000 + a.month * 100 + a.day;
  const bk = b.year * 10000 + b.month * 100 + b.day;
  return ak - bk;
}

/**
 * UTC instant when the room's wall clock reads y-mo-d h:mi in `timeZone`.
 * Scans ±48h around a naive UTC noon guess (no extra deps; DST-safe enough for our grid).
 */
export function roomWallClockToUtc(
  timeZone: string,
  y: number,
  /** Calendar month 1–12 */
  mo: number,
  d: number,
  /** 24-hour clock hour */
  h: number,
  mi: number,
): Date | null {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    hourCycle: "h23",
  });

  const matches = (dt: Date) => {
    const map: Record<string, number> = {};
    for (const p of formatter.formatToParts(dt)) {
      if (p.type !== "literal") {
        map[p.type] = Number(p.value);
      }
    }
    return (
      map.year === y &&
      map.month === mo &&
      map.day === d &&
      map.hour === h &&
      map.minute === mi
    );
  };

  // Start from UTC noon on the target date and scan ±48 hours in 1-min steps.
  // This brute-force approach avoids pulling in a full timezone library.
  const center = Date.UTC(y, mo - 1, d, 12, 0, 0);
  for (let i = -48 * 60; i <= 48 * 60; i++) {
    const dt = new Date(center + i * 60 * 1000);
    if (matches(dt)) {
      return dt;
    }
  }

  return null;
}

/**
 * Earliest bookable start (UTC) for `requestStart`'s calendar day in the room zone,
 * using the same 15-minute floor rule as the client. Browser UI uses local time; server
 * uses ROOM_TIME_ZONE — rare midnight mismatches are acceptable unless FC gets timeZone.
 */
function earliestBookableUtcForRequestStart(
  requestStart: Date,
  now: Date,
  roomTimeZone: string,
  slotMinMinutes: number,
  snapMinutes: number,
): { earliestUtc: Date } | "past_day" | null {
  const req = getZonedCalendarParts(requestStart, roomTimeZone);
  const nw = getZonedCalendarParts(now, roomTimeZone);
  const cmp = compareZonedCalendarDays(req, nw);

  if (cmp < 0) {
    return "past_day";
  }

  const slotH = Math.floor(slotMinMinutes / 60);
  const slotM = slotMinMinutes % 60;

  if (cmp > 0) {
    const slotUtc = roomWallClockToUtc(
      roomTimeZone,
      req.year,
      req.month,
      req.day,
      slotH,
      slotM,
    );
    return slotUtc ? { earliestUtc: slotUtc } : null;
  }

  const totalMin = nw.hour * 60 + nw.minute;
  const floored = Math.floor(totalMin / snapMinutes) * snapMinutes;
  const fh = Math.floor(floored / 60);
  const fm = floored % 60;

  const slotUtc = roomWallClockToUtc(
    roomTimeZone,
    nw.year,
    nw.month,
    nw.day,
    slotH,
    slotM,
  );
  const floorUtc = roomWallClockToUtc(
    roomTimeZone,
    nw.year,
    nw.month,
    nw.day,
    fh,
    fm,
  );

  if (!slotUtc || !floorUtc) {
    return null;
  }

  return {
    earliestUtc: new Date(
      Math.max(slotUtc.getTime(), floorUtc.getTime()),
    ),
  };
}

/** Extract the start time string from a Google Calendar event (timed or all-day). */
export function getEventStart(event: GoogleApiEvent): string {
  return event.start?.dateTime || event.start?.date || "";
}

/** Extract the end time string from a Google Calendar event (timed or all-day). */
export function getEventEnd(event: GoogleApiEvent): string {
  return event.end?.dateTime || event.end?.date || "";
}

/** True when two half-open intervals [existingStart, existingEnd) and [requestedStart, requestedEnd) overlap. */
function hasOverlap(
  existingStart: string,
  existingEnd: string,
  requestedStart: string,
  requestedEnd: string,
): boolean {
  const existingStartMs = new Date(existingStart).getTime();
  const existingEndMs = new Date(existingEnd).getTime();
  const requestedStartMs = new Date(requestedStart).getTime();
  const requestedEndMs = new Date(requestedEnd).getTime();

  return requestedStartMs < existingEndMs && requestedEndMs > existingStartMs;
}

/** Discriminated union returned by {@link validateBookingTimes}. */
type BookingTimeValidation =
  | { valid: true; requestStart: Date; requestEnd: Date }
  | { valid: false; error: string; status: number };

/**
 * Validate a proposed booking's start/end strings on the server.
 *
 * Checks parse-ability, ordering, duration bounds (30 min – 6 h),
 * and whether the start time is still bookable (not in the past and
 * not before the room's current snap-grid floor).
 *
 * @param start - ISO-8601 start string from the client.
 * @param end   - ISO-8601 end string from the client.
 */
export function validateBookingTimes(
  start: string,
  end: string,
): BookingTimeValidation {
  const requestStart = new Date(start);
  const requestEnd = new Date(end);

  if (
    Number.isNaN(requestStart.getTime()) ||
    Number.isNaN(requestEnd.getTime())
  ) {
    return { valid: false, error: "Invalid start or end time.", status: 400 };
  }

  if (requestEnd <= requestStart) {
    return {
      valid: false,
      error: "End time must be after start time.",
      status: 400,
    };
  }

  const durationMs = requestEnd.getTime() - requestStart.getTime();

  if (durationMs < MIN_BOOKING_MS || durationMs > MAX_BOOKING_MS) {
    return {
      valid: false,
      error: "Jam reservations must be between 30 minutes and 6 hours.",
      status: 400,
    };
  }

  // Fall back to LA if ROOM_TIME_ZONE isn't set (local dev default).
  const roomTimeZone =
    typeof process !== "undefined" && process.env.ROOM_TIME_ZONE
      ? process.env.ROOM_TIME_ZONE
      : "America/Los_Angeles";
  const slotMinMinutes = parseSlotTimeToMinutes(SLOT_MIN_STR);

  const earliestResult = earliestBookableUtcForRequestStart(
    requestStart,
    new Date(),
    roomTimeZone,
    slotMinMinutes,
    SNAP_MINUTES,
  );

  if (earliestResult === "past_day") {
    return {
      valid: false,
      error: "You can\u2019t book dates in the past.",
      status: 400,
    };
  }

  if (earliestResult === null) {
    return {
      valid: false,
      error: "Unable to validate booking time.",
      status: 400,
    };
  }

  if (requestStart.getTime() < earliestResult.earliestUtc.getTime()) {
    return {
      valid: false,
      error: "That start time is no longer available.",
      status: 400,
    };
  }

  return { valid: true, requestStart, requestEnd };
}

/**
 * Checks both practice and jam Google Calendars for events that overlap
 * the requested time range. Returns true if an overlap is found.
 */
export async function checkGoogleCalendarOverlap(
  calendar: calendar_v3.Calendar,
  practiceCalendarId: string,
  jamCalendarId: string,
  start: string,
  end: string,
): Promise<{ overlapping: boolean; error?: string }> {
  const requestStart = new Date(start);
  const requestEnd = new Date(end);

  const [practiceResponse, jamResponse] = await Promise.all([
    calendar.events.list({
      calendarId: practiceCalendarId,
      timeMin: requestStart.toISOString(),
      timeMax: requestEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    }),
    calendar.events.list({
      calendarId: jamCalendarId,
      timeMin: requestStart.toISOString(),
      timeMax: requestEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    }),
  ]);

  const existingEvents = [
    ...(practiceResponse.data.items ?? []),
    ...(jamResponse.data.items ?? []),
  ].filter((event) => {
    const typedEvent = event as GoogleApiEvent;

    return (
      !!typedEvent.id &&
      !!getEventStart(typedEvent) &&
      !!getEventEnd(typedEvent)
    );
  });

  const overlappingEvent = existingEvents.find((event) => {
    const typedEvent = event as GoogleApiEvent;
    const eventStart = getEventStart(typedEvent);
    const eventEnd = getEventEnd(typedEvent);

    return hasOverlap(eventStart, eventEnd, start, end);
  });

  if (overlappingEvent) {
    return {
      overlapping: true,
      error: "That time overlaps with an existing booking.",
    };
  }

  return { overlapping: false };
}
