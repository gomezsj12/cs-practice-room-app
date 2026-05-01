/**
 * Builds the practice "Custom Event ID" stored in Notion and matched against
 * Google Calendar practice events.
 *
 * Current format:
 * `GOOGLECALidentifier-<startSegment>-<endSegment><phoneDigits><attendeeCount>`
 *
 * Legacy format:
 * `GOOGLECALidentifier-<startSegment>-<endSegment>`
 *
 * Each time segment is lowercase English month + day + year + 12-hour time +
 * `(utc)`, for example: `may62026415am(utc)`.
 */
import {
  getEventEnd,
  getEventStart,
  getZonedCalendarParts,
  roomWallClockToUtc,
} from "@/lib/calendar-helpers";
import { extractSessionAttendeesLine } from "@/lib/session-attendees";
import type { GoogleApiEvent } from "@/lib/types";

/** Literal prefix; casing is fixed. */
export const PRACTICE_CUSTOM_EVENT_ID_PREFIX = "GOOGLECALidentifier";

type PracticeCustomEventIdMetadata = {
  attendeeCount: number;
  phoneDigits: string;
};

const LOWER_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const CUSTOM_EVENT_SEGMENT_RE =
  /[a-z]+\d{1,2}\d{4}\d{1,2}\d{2}(?:am|pm)\(utc\)/i;

const PHONE_RE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b|\b\d{10}\b|\b\+?\d[\d().\s-]{8,14}\d\b/g;

/**
 * Format one UTC instant as e.g. `april122026700pm(utc)`.
 */
export function formatUtcInstantForPracticeCustomEventId(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const month = LOWER_MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const h24 = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const isPm = h24 >= 12;
  let h12 = h24 % 12;
  if (h12 === 0) {
    h12 = 12;
  }
  const ampm = isPm ? "pm" : "am";
  const minuteStr = String(minutes).padStart(2, "0");

  return `${month}${day}${year}${h12}${minuteStr}${ampm}(utc)`;
}

/**
 * Same segment shape as {@link formatUtcInstantForPracticeCustomEventId}, but
 * using wall clock time in `timeZone`.
 */
export function formatWallClockInstantForPracticeCustomEventId(
  date: Date,
  timeZone: string,
): string {
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const z = getZonedCalendarParts(date, timeZone);
  const month = LOWER_MONTHS[z.month - 1];
  const day = z.day;
  const year = z.year;
  const h24 = z.hour;
  const minutes = z.minute;
  const isPm = h24 >= 12;
  let h12 = h24 % 12;
  if (h12 === 0) {
    h12 = 12;
  }
  const ampm = isPm ? "pm" : "am";
  const minuteStr = String(minutes).padStart(2, "0");

  return `${month}${day}${year}${h12}${minuteStr}${ampm}(utc)`;
}

function normalizePracticePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function extractPracticeCustomEventIdMetadataFromDescription(
  description?: string | null,
): PracticeCustomEventIdMetadata | null {
  const text = description?.replace(/\r\n/g, "\n").trim() ?? "";
  if (!text) {
    return null;
  }

  const attendeeCount = extractSessionAttendeesLine(text)?.count;
  if (
    attendeeCount === undefined ||
    !Number.isInteger(attendeeCount) ||
    attendeeCount < 0
  ) {
    return null;
  }

  const phoneMatches = text.match(PHONE_RE) ?? [];
  for (const rawPhone of phoneMatches) {
    const phoneDigits = normalizePracticePhoneDigits(rawPhone);
    if (phoneDigits.length >= 10 && phoneDigits.length <= 15) {
      return { attendeeCount, phoneDigits };
    }
  }

  return null;
}

function buildPracticeCustomEventIdFromSegments(
  startSeg: string,
  endSeg: string,
  metadata?: PracticeCustomEventIdMetadata | null,
): string {
  const suffix = metadata
    ? `${metadata.phoneDigits}${metadata.attendeeCount}`
    : "";
  return `${PRACTICE_CUSTOM_EVENT_ID_PREFIX}-${startSeg}-${endSeg}${suffix}`;
}

function buildPracticeCustomEventIdFromDates(
  start: Date,
  end: Date,
  formatInstant: (date: Date) => string,
  metadata?: PracticeCustomEventIdMetadata | null,
): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const startSeg = formatInstant(start);
  const endSeg = formatInstant(end);
  if (!startSeg || !endSeg) {
    return null;
  }

  return buildPracticeCustomEventIdFromSegments(startSeg, endSeg, metadata);
}

function getTimedPracticeEventBounds(event: GoogleApiEvent): {
  start: Date;
  end: Date;
} | null {
  const startRaw = getEventStart(event);
  const endRaw = getEventEnd(event);
  if (!startRaw || !endRaw) {
    return null;
  }

  if (!event.start?.dateTime || !event.end?.dateTime) {
    return null;
  }

  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

export function buildLegacyPracticeCustomEventIdFromGoogleEvent(
  event: GoogleApiEvent,
): string | null {
  const bounds = getTimedPracticeEventBounds(event);
  if (!bounds) {
    return null;
  }

  return buildPracticeCustomEventIdFromDates(
    bounds.start,
    bounds.end,
    formatUtcInstantForPracticeCustomEventId,
  );
}

export function buildLegacyPracticeCustomEventIdFromGoogleEventInTimeZone(
  event: GoogleApiEvent,
  timeZone: string,
): string | null {
  const bounds = getTimedPracticeEventBounds(event);
  if (!bounds) {
    return null;
  }

  return buildPracticeCustomEventIdFromDates(
    bounds.start,
    bounds.end,
    (date) => formatWallClockInstantForPracticeCustomEventId(date, timeZone),
  );
}

export function buildPracticeCustomEventIdCandidatesFromDateRange(input: {
  start: Date;
  end: Date;
  timeZone: string;
  description?: string | null;
}): string[] {
  const metadata = extractPracticeCustomEventIdMetadataFromDescription(
    input.description,
  );

  const candidates = [
    buildPracticeCustomEventIdFromDates(
      input.start,
      input.end,
      formatUtcInstantForPracticeCustomEventId,
      metadata,
    ),
    buildPracticeCustomEventIdFromDates(
      input.start,
      input.end,
      (date) =>
        formatWallClockInstantForPracticeCustomEventId(date, input.timeZone),
      metadata,
    ),
    buildPracticeCustomEventIdFromDates(
      input.start,
      input.end,
      formatUtcInstantForPracticeCustomEventId,
    ),
    buildPracticeCustomEventIdFromDates(
      input.start,
      input.end,
      (date) =>
        formatWallClockInstantForPracticeCustomEventId(date, input.timeZone),
    ),
  ];

  return [...new Set(candidates.filter((id): id is string => Boolean(id)))];
}

export function buildPracticeCustomEventIdCandidatesFromGoogleEvent(
  event: GoogleApiEvent,
  timeZone: string,
): string[] {
  const bounds = getTimedPracticeEventBounds(event);
  if (!bounds) {
    return [];
  }

  return buildPracticeCustomEventIdCandidatesFromDateRange({
    start: bounds.start,
    end: bounds.end,
    timeZone,
    description: event.description,
  });
}

/**
 * Returns the current canonical Custom Event ID for a Google Calendar practice
 * event. When attendee/phone metadata is unavailable, this falls back to the
 * legacy time-only format.
 */
export function buildPracticeCustomEventIdFromGoogleEvent(
  event: GoogleApiEvent,
): string | null {
  const bounds = getTimedPracticeEventBounds(event);
  if (!bounds) {
    return null;
  }

  const metadata = extractPracticeCustomEventIdMetadataFromDescription(
    event.description,
  );

  return (
    buildPracticeCustomEventIdFromDates(
      bounds.start,
      bounds.end,
      formatUtcInstantForPracticeCustomEventId,
      metadata,
    ) ?? buildLegacyPracticeCustomEventIdFromGoogleEvent(event)
  );
}

/**
 * Same as {@link buildPracticeCustomEventIdFromGoogleEvent} but encodes
 * start/end using wall clock time in `timeZone`.
 */
export function buildPracticeCustomEventIdFromGoogleEventInTimeZone(
  event: GoogleApiEvent,
  timeZone: string,
): string | null {
  const bounds = getTimedPracticeEventBounds(event);
  if (!bounds) {
    return null;
  }

  const metadata = extractPracticeCustomEventIdMetadataFromDescription(
    event.description,
  );

  return (
    buildPracticeCustomEventIdFromDates(
      bounds.start,
      bounds.end,
      (date) => formatWallClockInstantForPracticeCustomEventId(date, timeZone),
      metadata,
    ) ??
    buildLegacyPracticeCustomEventIdFromGoogleEventInTimeZone(event, timeZone)
  );
}

/** Case-insensitive equality for Custom Event IDs. */
export function practiceCustomEventIdsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function splitPracticeCustomEventSegments(
  customId: string,
): { startSeg: string; endSeg: string } | null {
  const trimmed = customId.trim();
  const m = trimmed.match(
    new RegExp(
      `^${PRACTICE_CUSTOM_EVENT_ID_PREFIX}-(${CUSTOM_EVENT_SEGMENT_RE.source})-(${CUSTOM_EVENT_SEGMENT_RE.source})(?:\\d+)?$`,
      "i",
    ),
  );
  if (!m?.[1] || !m[2]) {
    return null;
  }
  return { startSeg: m[1], endSeg: m[2] };
}

/**
 * Parse a Custom Event ID string back to UTC start/end instants. Supports both
 * the legacy time-only format and the newer attendee/phone suffix.
 */
export function parsePracticeCustomEventId(
  customId: string,
): { start: Date; end: Date } | null {
  const parts = splitPracticeCustomEventSegments(customId);
  if (!parts) {
    return null;
  }

  const start = parseUtcInstantSegment(parts.startSeg);
  const end = parseUtcInstantSegment(parts.endSeg);
  if (!start || !end) {
    return null;
  }

  return { start, end };
}

/**
 * Interpret each `(utc)`-suffixed segment as wall clock in `timeZone`, not as
 * UTC. Supports both the legacy time-only format and the newer attendee/phone
 * suffix.
 */
export function parsePracticeCustomEventIdAsRoomWallClock(
  customId: string,
  timeZone: string,
): { start: Date; end: Date } | null {
  const parts = splitPracticeCustomEventSegments(customId);
  if (!parts) {
    return null;
  }

  const start = parseUtcInstantSegmentAsRoomWallClock(parts.startSeg, timeZone);
  const end = parseUtcInstantSegmentAsRoomWallClock(parts.endSeg, timeZone);
  if (!start || !end) {
    return null;
  }

  return { start, end };
}

function parseUtcInstantSegment(segment: string): Date | null {
  const suffix = "(utc)";
  if (!segment.endsWith(suffix)) {
    return null;
  }
  const body = segment.slice(0, -suffix.length);

  for (let mi = 0; mi < LOWER_MONTHS.length; mi += 1) {
    const monthName = LOWER_MONTHS[mi];
    if (!body.startsWith(monthName)) {
      continue;
    }

    const afterMonth = body.slice(monthName.length);
    const m = afterMonth.match(/^(\d{1,2})(\d{4})(\d{1,2})(\d{2})(am|pm)$/);
    if (!m) {
      return null;
    }

    const day = Number(m[1]);
    const year = Number(m[2]);
    const hour12 = Number(m[3]);
    const minute = Number(m[4]);
    const ampm = m[5];

    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31 ||
      !Number.isInteger(year) ||
      year < 1970 ||
      year > 2100 ||
      !Number.isInteger(hour12) ||
      hour12 < 1 ||
      hour12 > 12 ||
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    let h24 = hour12 % 12;
    if (ampm === "pm") {
      h24 += 12;
    }

    return new Date(Date.UTC(year, mi, day, h24, minute, 0, 0));
  }

  return null;
}

function parseUtcInstantSegmentAsRoomWallClock(
  segment: string,
  timeZone: string,
): Date | null {
  const suffix = "(utc)";
  if (!segment.endsWith(suffix)) {
    return null;
  }
  const body = segment.slice(0, -suffix.length);

  for (let mi = 0; mi < LOWER_MONTHS.length; mi += 1) {
    const monthName = LOWER_MONTHS[mi];
    if (!body.startsWith(monthName)) {
      continue;
    }

    const afterMonth = body.slice(monthName.length);
    const m = afterMonth.match(/^(\d{1,2})(\d{4})(\d{1,2})(\d{2})(am|pm)$/);
    if (!m) {
      return null;
    }

    const day = Number(m[1]);
    const year = Number(m[2]);
    const hour12 = Number(m[3]);
    const minute = Number(m[4]);
    const ampm = m[5];

    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31 ||
      !Number.isInteger(year) ||
      year < 1970 ||
      year > 2100 ||
      !Number.isInteger(hour12) ||
      hour12 < 1 ||
      hour12 > 12 ||
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    let h24 = hour12 % 12;
    if (ampm === "pm") {
      h24 += 12;
    }

    return roomWallClockToUtc(timeZone, year, mi + 1, day, h24, minute);
  }

  return null;
}
