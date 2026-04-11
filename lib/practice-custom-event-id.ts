/**
 * Builds the **Custom Event ID** string stored in Notion (Fillout Form Master Database)
 * and matched on practice cancellation. Must stay in lockstep with how that value is
 * produced in Notion / Fillout.
 *
 * ## Format (UTC wall clock, three hyphen-separated parts)
 *
 * `GOOGLECALidentifier-<startSegment>-<endSegment>`
 *
 * Each segment is: **lowercase English full month** + **day** (1–31, no leading zero) +
 * **four-digit year** + **12-hour clock** + **`(utc)`**.
 *
 * 12-hour part: hour **1–12** (no leading zero) + **two-digit minutes** + **`am`** or **`pm`**
 * (lowercase). Examples: `700pm`, `730am`, `1200pm`, `1205am`.
 *
 * Instant source: `Date` in **UTC** (same wall time as Google Calendar API `dateTime`
 * when parsed to `Date`).
 *
 * @see {@link ../lib/calendar-helpers} — `getEventStart`, `getEventEnd`
 */
import { getEventEnd, getEventStart } from "@/lib/calendar-helpers";
import type { GoogleApiEvent } from "@/lib/types";

/** Literal prefix; casing is fixed. */
export const PRACTICE_CUSTOM_EVENT_ID_PREFIX = "GOOGLECALidentifier";

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
  const timeCore = `${h12}${minuteStr}${ampm}`;

  return `${month}${day}${year}${timeCore}(utc)`;
}

/**
 * Returns the Custom Event ID for a Google Calendar practice event, or `null` if
 * start/end are missing, not parseable, or not timed (`dateTime` required).
 */
export function buildPracticeCustomEventIdFromGoogleEvent(
  event: GoogleApiEvent,
): string | null {
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

  const startSeg = formatUtcInstantForPracticeCustomEventId(start);
  const endSeg = formatUtcInstantForPracticeCustomEventId(end);
  if (!startSeg || !endSeg) {
    return null;
  }

  return `${PRACTICE_CUSTOM_EVENT_ID_PREFIX}-${startSeg}-${endSeg}`;
}

/**
 * Parse a **Custom Event ID** string back to UTC start/end instants. Inverse of
 * {@link buildPracticeCustomEventIdFromGoogleEvent} when formatting matches
 * {@link formatUtcInstantForPracticeCustomEventId}.
 */
export function parsePracticeCustomEventId(
  customId: string,
): { start: Date; end: Date } | null {
  const trimmed = customId.trim();
  const prefix = `${PRACTICE_CUSTOM_EVENT_ID_PREFIX}-`;
  if (!trimmed.startsWith(prefix)) {
    return null;
  }

  const rest = trimmed.slice(prefix.length);
  const firstHyphen = rest.indexOf("-");
  if (firstHyphen <= 0) {
    return null;
  }

  const startSeg = rest.slice(0, firstHyphen);
  const endSeg = rest.slice(firstHyphen + 1);
  if (!startSeg || !endSeg || endSeg.includes("-")) {
    return null;
  }

  const start = parseUtcInstantSegment(startSeg);
  const end = parseUtcInstantSegment(endSeg);
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

  for (let mi = 0; mi < LOWER_MONTHS.length; mi++) {
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
