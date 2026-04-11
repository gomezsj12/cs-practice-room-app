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
