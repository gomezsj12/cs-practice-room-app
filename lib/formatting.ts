/** Shared formatting helpers. */

import { sameLocalCalendarDay } from "@/lib/timeGridDragSelect";

/** Zero-pad a number to two digits (used for month, day, minute). */
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** 12-hour clock: hour 1–12 without leading zero, minutes always two digits. */
function clock12hm(d: Date): string {
  let h = d.getHours() % 12;
  if (h === 0) {
    h = 12;
  }
  return `${h}:${pad2(d.getMinutes())}`;
}

/** Return `"AM"` or `"PM"` based on the local hour. */
function meridiem(d: Date): "AM" | "PM" {
  return d.getHours() >= 12 ? "PM" : "AM";
}

/**
 * Modal range line: `mm/dd/yyyy, h:mm → h:mm PM` (literal →), no seconds; hour unpadded except 10–12.
 * Same calendar day + same AM/PM uses one suffix on the end time only.
 */
export function formatBookingDateRange(start: Date, end: Date): string {
  const datePart = `${pad2(start.getMonth() + 1)}/${pad2(start.getDate())}/${start.getFullYear()}`;

  if (!sameLocalCalendarDay(start, end)) {
    const endDate = `${pad2(end.getMonth() + 1)}/${pad2(end.getDate())}/${end.getFullYear()}`;
    return `${datePart}, ${clock12hm(start)} ${meridiem(start)} → ${endDate}, ${clock12hm(end)} ${meridiem(end)}`;
  }

  const startM = meridiem(start);
  const endM = meridiem(end);
  if (startM === endM) {
    return `${datePart}, ${clock12hm(start)} → ${clock12hm(end)} ${endM}`;
  }

  return `${datePart}, ${clock12hm(start)} ${startM} → ${clock12hm(end)} ${endM}`;
}

const MONTH_NAMES_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatMonthDayYearLong(d: Date): string {
  return `${MONTH_NAMES_FULL[d.getMonth()]} ${pad2(d.getDate())}, ${d.getFullYear()}`;
}

/**
 * Event details modal: `h:mm → h:mm PM, April 07, 2026` (literal →); cross-day
 * repeats the date after each time.
 */
export function formatEventModalDateRange(start: Date, end: Date): string {
  if (!sameLocalCalendarDay(start, end)) {
    return `${clock12hm(start)} ${meridiem(start)}, ${formatMonthDayYearLong(start)} → ${clock12hm(end)} ${meridiem(end)}, ${formatMonthDayYearLong(end)}`;
  }

  const datePart = formatMonthDayYearLong(start);
  const startM = meridiem(start);
  const endM = meridiem(end);
  if (startM === endM) {
    return `${clock12hm(start)} → ${clock12hm(end)} ${endM}, ${datePart}`;
  }

  return `${clock12hm(start)} ${startM} → ${clock12hm(end)} ${endM}, ${datePart}`;
}

/** Hold countdown copy; clamps at 1 so it never shows 0 before the hold ends. */
export function formatHoldSecondsRemaining(seconds: number): string {
  const n = Math.max(1, Math.floor(seconds));
  return n === 1 ? "1 second" : `${n} seconds`;
}
