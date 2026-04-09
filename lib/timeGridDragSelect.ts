/** Helpers for custom time-grid drag-select (walls at max duration and busy events). */

import type { CalendarApi } from "@fullcalendar/core";

/* ------------------------------------------------------------------ */
/*  Grid constants — keep in sync with FullCalendar view config.      */
/* ------------------------------------------------------------------ */

/** Earliest visible slot in the time grid (FullCalendar `slotMinTime`). */
export const SLOT_MIN_STR = "12:00:00";
/** Latest visible slot in the time grid (FullCalendar `slotMaxTime`). */
export const SLOT_MAX_STR = "24:00:00";
/** Snap granularity in minutes; all drag boundaries align to this. */
export const SNAP_MINUTES = 15;
/** Minimum bookable duration (30 minutes). */
export const MIN_BOOKING_MS = 30 * 60 * 1000;
/** Maximum bookable duration (6 hours). */
export const MAX_BOOKING_MS = 6 * 60 * 60 * 1000;

/** Latest 15-minute snap that still lies on the booking day (avoids setHours(24) → next day). */
function lastSnappedMinuteBeforeSlotMax(slotMaxMin: number): number {
  return snapMinutes(slotMaxMin - SNAP_MINUTES, SNAP_MINUTES);
}

/** Clamp selection end to the last snapped instant on `start`'s local calendar day. */
function clampEndToGridDay(
  start: Date,
  end: Date,
  slotMaxMin: number,
): Date {
  const day0 = new Date(start);
  day0.setHours(0, 0, 0, 0);
  const lastMinute = lastSnappedMinuteBeforeSlotMax(slotMaxMin);
  const maxEnd = dateAtLocalMinutes(day0, lastMinute);
  return new Date(Math.min(end.getTime(), maxEnd.getTime()));
}

/**
 * Parse an `HH:MM:SS` slot-time string into total minutes from midnight.
 * Fractional seconds are converted to fractional minutes.
 */
export function parseSlotTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  const s = Number(parts[2] ?? 0);
  return h * 60 + m + s / 60;
}

const SLOT_MAX_MINUTES = parseSlotTimeToMinutes(SLOT_MAX_STR);

/** Round `value` to the nearest multiple of `snap`. */
function snapMinutes(value: number, snap: number): number {
  return Math.round(value / snap) * snap;
}

/** True when `a` and `b` fall on the same local calendar day. */
export function sameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Midnight (00:00:00.000) on `d`'s local calendar day. */
function startOfLocalCalendarDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** True when `dayDate` is a local calendar day strictly before today. */
export function isPastCalendarDay(dayDate: Date): boolean {
  const today = startOfLocalCalendarDay(new Date());
  const day = startOfLocalCalendarDay(dayDate);
  return day.getTime() < today.getTime();
}

/**
 * Same local calendar day as `d`, with clock time floored to the snap grid
 * (e.g. 5:05 PM → 5:00 PM for 15-minute snaps).
 */
function floorLocalTimeToSnap(d: Date, snapMinutes: number): Date {
  const midnight = startOfLocalCalendarDay(d);
  const totalMin =
    d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const floored = Math.floor(totalMin / snapMinutes) * snapMinutes;
  return dateAtLocalMinutes(midnight, floored);
}

/**
 * Earliest instant users may start a booking on `dayDate` (browser local).
 * Past days: callers should block first; this returns that day's slot open as a fallback.
 */
export function earliestBookableStartForColumnDay(
  dayDate: Date,
  now: Date,
  slotMinMinutes: number,
): Date {
  const day0 = startOfLocalCalendarDay(dayDate);
  const slotOpen = dateAtLocalMinutes(day0, slotMinMinutes);

  if (isPastCalendarDay(dayDate)) {
    return slotOpen;
  }

  if (sameLocalCalendarDay(dayDate, now)) {
    const flooredNow = floorLocalTimeToSnap(now, SNAP_MINUTES);
    return new Date(Math.max(slotOpen.getTime(), flooredNow.getTime()));
  }

  return slotOpen;
}

/**
 * Post-process a merged range so its start is not before the earliest bookable
 * instant for the column's day (e.g. "now" floored to the snap grid, or the
 * slot-min boundary for future days).
 *
 * If bumping the start invalidates the range (blocker collision, too short,
 * past grid-day boundary) returns `null`. Otherwise re-applies the same
 * clip/clamp pipeline as {@link mergeSelectionRange}.
 *
 * @param merged     - Output from `mergeSelectionRange`; may already be null.
 * @param dayDate    - The calendar column day the selection lives on.
 * @param now        - Current wall-clock time (used for "today" columns).
 * @param slotMinMin - Minutes-from-midnight of the earliest grid slot.
 * @param blockers   - Busy intervals on the same day.
 */
export function applyMinBookableStartToRange(
  merged: { start: Date; end: Date } | null,
  dayDate: Date,
  now: Date,
  slotMinMin: number,
  blockers: BlockingInterval[],
): { start: Date; end: Date } | null {
  if (!merged) {
    return null;
  }

  const minStart = earliestBookableStartForColumnDay(dayDate, now, slotMinMin);
  let { start, end } = merged;

  // Already valid — no adjustment needed.
  if (start.getTime() >= minStart.getTime()) {
    return merged;
  }

  // Bump start to the earliest bookable instant.
  start = new Date(minStart);
  if (start.getTime() >= end.getTime()) {
    return null;
  }

  // Re-run the full clip pipeline with the new start.
  start = clipSelectionStart(start, end, blockers);
  if (start.getTime() >= end.getTime()) {
    return null;
  }

  end = clipSelectionEnd(start, end, blockers);
  if (start.getTime() >= end.getTime()) {
    return null;
  }

  // Try inflating to MIN_BOOKING_MS if clipping shrank the range.
  if (end.getTime() - start.getTime() < MIN_BOOKING_MS) {
    end = clipSelectionEnd(
      start,
      new Date(start.getTime() + MIN_BOOKING_MS),
      blockers,
    );
  }

  if (end.getTime() - start.getTime() < MIN_BOOKING_MS) {
    return null;
  }

  end = clampEndToGridDay(start, end, SLOT_MAX_MINUTES);

  if (end.getTime() - start.getTime() < MIN_BOOKING_MS) {
    return null;
  }

  return { start, end };
}

/** Return a Date on `dayMidnight`'s calendar day at the given minutes-from-midnight. */
function dateAtLocalMinutes(dayMidnight: Date, minutesFromMidnight: number): Date {
  const d = new Date(dayMidnight);
  d.setHours(0, 0, 0, 0);
  const h = Math.floor(minutesFromMidnight / 60);
  const m = Math.round(minutesFromMidnight - h * 60);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Extract total minutes-from-midnight for `d` in the browser's local time zone. */
function localMinutesFromDate(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** A busy block on the calendar that drag selections must not overlap. */
export type BlockingInterval = { start: string; end: string };

/** True if `instant` falls inside a busy block [start, end) on the same local day. */
export function isInstantInsideBusy(
  instant: Date,
  blockers: BlockingInterval[],
): boolean {
  const t = instant.getTime();
  for (const ev of blockers) {
    const es = new Date(ev.start).getTime();
    const ee = new Date(ev.end).getTime();
    if (!sameLocalCalendarDay(instant, new Date(ev.start))) {
      continue;
    }
    if (t >= es && t < ee) {
      return true;
    }
  }
  return false;
}

/**
 * Push `start` forward past any busy blocks it overlaps, returning the
 * first free instant. Used when the user drags upward into a busy region
 * so the selection snaps to just after the blocker ends.
 *
 * Uses a fixpoint loop: if pushing past one blocker lands inside another,
 * the loop re-runs until no blocker contains `startMs`.
 */
function clipSelectionStart(
  start: Date,
  end: Date,
  blockers: BlockingInterval[],
): Date {
  let startMs = start.getTime();
  const endMs = end.getTime();
  if (startMs >= endMs) {
    return new Date(startMs);
  }

  // Fixpoint: keep advancing startMs until it sits outside every blocker.
  let changed = true;
  while (changed) {
    changed = false;
    for (const ev of blockers) {
      const es = new Date(ev.start).getTime();
      const ee = new Date(ev.end).getTime();
      if (!sameLocalCalendarDay(new Date(startMs), new Date(ev.start))) {
        continue;
      }
      // Skip blockers entirely before or after the candidate range.
      if (es >= endMs || ee <= startMs) {
        continue;
      }
      // startMs is inside [es, ee) → jump to the blocker's end.
      if (startMs >= es && startMs < ee) {
        startMs = Math.max(startMs, ee);
        changed = true;
      }
    }
  }

  return new Date(Math.min(startMs, endMs));
}

/**
 * Pull `end` back so the selection [start, end) never:
 *  1. Exceeds the 6-hour maximum duration.
 *  2. Overlaps any busy block on the same calendar day.
 *
 * Two overlap scenarios are handled:
 *  - A blocker that *starts after* `start` → end is clamped to the blocker's start.
 *  - A blocker whose *end* falls between start and the current end → end is
 *    clamped to that blocker's end (prevents partial overlap from the left).
 */
function clipSelectionEnd(
  start: Date,
  end: Date,
  blockers: BlockingInterval[],
): Date {
  let endMs = end.getTime();
  const startMs = start.getTime();
  // Hard wall: never exceed MAX_BOOKING_MS from start.
  endMs = Math.min(endMs, startMs + MAX_BOOKING_MS);

  for (const ev of blockers) {
    const es = new Date(ev.start).getTime();
    const ee = new Date(ev.end).getTime();
    if (!sameLocalCalendarDay(start, new Date(ev.start))) {
      continue;
    }
    if (es >= endMs || ee <= startMs) {
      continue;
    }
    // Blocker starts inside our range → can't extend past it.
    if (es > startMs) {
      endMs = Math.min(endMs, es);
    }
    // Blocker ends inside our range from the left side.
    if (ee > startMs && ee < endMs) {
      endMs = Math.min(endMs, ee);
    }
  }

  return new Date(Math.max(endMs, startMs));
}

/**
 * Core drag-select algorithm: converts a raw anchor + pointer pair into a
 * valid bookable [start, end) range, or `null` if no valid range exists.
 *
 * Pipeline:
 *  1. Order anchor/pointer into [start, end).
 *  2. If the span is smaller than one snap interval, inflate to MIN_BOOKING_MS.
 *  3. Clip start forward past any blockers it sits inside.
 *  4. Clip end backward before any blockers or the 6-hour wall.
 *  5. If the remaining gap is below MIN_BOOKING_MS, try inflating end once more.
 *  6. Clamp end to the grid day boundary (last snap before slotMax).
 *  7. Final MIN_BOOKING_MS check — return null if still too short.
 *
 * @param anchor   - The time the user first pressed down.
 * @param pointer  - The time the pointer is currently over (or released at).
 * @param blockers - Busy intervals on the same day to avoid.
 */
export function mergeSelectionRange(
  anchor: Date,
  pointer: Date,
  blockers: BlockingInterval[],
): { start: Date; end: Date } | null {
  let start = new Date(Math.min(anchor.getTime(), pointer.getTime()));
  let end = new Date(Math.max(anchor.getTime(), pointer.getTime()));

  // Tiny drag (< one snap) → inflate to minimum bookable duration.
  if (end.getTime() - start.getTime() < SNAP_MINUTES * 60 * 1000) {
    end = new Date(start.getTime() + MIN_BOOKING_MS);
  }

  // --- Wall-clip pass 1: push start past blockers ---
  start = clipSelectionStart(start, end, blockers);

  if (start.getTime() >= end.getTime()) {
    return null;
  }

  // --- Wall-clip pass 2: pull end before blockers / 6h cap ---
  end = clipSelectionEnd(start, end, blockers);

  if (start.getTime() >= end.getTime()) {
    return null;
  }

  // Range might now be shorter than MIN_BOOKING_MS after clipping;
  // try re-expanding end (still respecting blockers).
  if (end.getTime() - start.getTime() < MIN_BOOKING_MS) {
    end = clipSelectionEnd(start, new Date(start.getTime() + MIN_BOOKING_MS), blockers);
  }

  if (end.getTime() - start.getTime() < MIN_BOOKING_MS) {
    return null;
  }

  // Clamp to the last snap boundary before slotMax so we don't spill into the next day.
  end = clampEndToGridDay(start, end, SLOT_MAX_MINUTES);

  if (end.getTime() - start.getTime() < MIN_BOOKING_MS) {
    return null;
  }

  return { start, end };
}

/**
 * Derive the calendar day `Date` for a FullCalendar time-grid column by index.
 * Column 0 is the view's `activeStart`; each subsequent column is +1 day.
 */
export function dayDateForColumn(api: CalendarApi, colIndex: number): Date {
  const start = api.view.activeStart;
  const d = new Date(start.valueOf());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + colIndex);
  return d;
}

/**
 * FullCalendar renders one shared `.fc-timegrid-slots` under `.fc-timegrid-body`,
 * not inside each `.fc-timegrid-col`. Must use this for Y → time mapping.
 */
function getSharedTimeGridSlotsEl(
  calendarRoot: HTMLElement,
): HTMLElement | null {
  return (
    (calendarRoot.querySelector(
      ".fc-timegrid-body .fc-timegrid-slots",
    ) as HTMLElement | null) ??
    (calendarRoot.querySelector(".fc-timegrid-slots") as HTMLElement | null)
  );
}

/**
 * Convert a viewport Y coordinate to a snap-aligned minutes-from-midnight value.
 *
 * Maps `clientY` against the shared time-grid slots element's bounding rect,
 * linearly interpolates between slotMin and slotMax, snaps to the grid, and
 * clamps to [slotMin, lastSnap].
 */
export function clientYToSnappedMinutes(
  clientY: number,
  calendarRoot: HTMLElement,
  slotMinMin: number,
  slotMaxMin: number,
): number {
  const slots = getSharedTimeGridSlotsEl(calendarRoot);
  if (!slots) {
    return slotMinMin;
  }
  const rect = slots.getBoundingClientRect();
  const y = Math.min(Math.max(0, clientY - rect.top), rect.height);
  const ratio = rect.height > 0 ? y / rect.height : 0;
  const span = slotMaxMin - slotMinMin;
  const raw = slotMinMin + ratio * span;
  const snapped = snapMinutes(raw, SNAP_MINUTES);
  const maxSnapped = lastSnappedMinuteBeforeSlotMax(slotMaxMin);
  return Math.min(Math.max(snapped, slotMinMin), maxSnapped);
}

/** Convenience wrapper: combine a day date and minutes-from-midnight into one `Date`. */
export function minutesOnDayToDate(dayDate: Date, minutesFromMidnight: number): Date {
  return dateAtLocalMinutes(new Date(dayDate), minutesFromMidnight);
}

/**
 * Calculate viewport-relative pixel bounds for a drag-mirror overlay
 * that visually represents the selection [start, end) within a column.
 *
 * The mirror is positioned using the shared time-grid slots element for Y
 * and the column element for X/width. Returns `null` if the slots element
 * is missing (e.g. calendar not yet rendered).
 */
export function mirrorBoundsForRange(
  colEl: HTMLElement,
  calendarRoot: HTMLElement,
  start: Date,
  end: Date,
  slotMinMin: number,
  slotMaxMin: number,
): { top: number; left: number; width: number; height: number } | null {
  const slots = getSharedTimeGridSlotsEl(calendarRoot);
  if (!slots) {
    return null;
  }
  const slotsRect = slots.getBoundingClientRect();
  const colRect = colEl.getBoundingClientRect();
  const span = slotMaxMin - slotMinMin;
  if (span <= 0) {
    return null;
  }

  const sm = localMinutesFromDate(start);
  let em = localMinutesFromDate(end);
  // Cross-day or zero-length edge cases: cap to grid boundary.
  if (!sameLocalCalendarDay(start, end) || em <= sm) {
    em = lastSnappedMinuteBeforeSlotMax(slotMaxMin);
  }
  // Safety: ensure em > sm so we always draw a visible mirror.
  if (em <= sm) {
    em = Math.min(
      lastSnappedMinuteBeforeSlotMax(slotMaxMin),
      sm + SNAP_MINUTES,
    );
  }
  const topFrac = (sm - slotMinMin) / span;
  const botFrac = (em - slotMinMin) / span;
  const topPx = topFrac * slotsRect.height;
  const botPx = botFrac * slotsRect.height;

  return {
    top: slotsRect.top + topPx,
    left: colRect.left,
    width: colRect.width,
    height: Math.max(8, botPx - topPx),
  };
}

/**
 * Hit-test all time-grid body columns and return the one containing
 * (`clientX`, `clientY`), along with its zero-based index.
 * Returns `null` if the pointer is outside every column.
 */
export function findBodyColumnIndex(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): { col: HTMLElement; index: number } | null {
  const cols = root.querySelectorAll(
    ".fc-timegrid-body .fc-timegrid-col:not(.fc-timegrid-axis)",
  );
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i] as HTMLElement;
    const r = col.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return { col, index: i };
    }
  }
  return null;
}

/** True when the selection duration falls within the [30 min, 6 h] bookable range. */
export function selectionIsBookable(start: Date, end: Date): boolean {
  const ms = end.getTime() - start.getTime();
  return ms >= MIN_BOOKING_MS && ms <= MAX_BOOKING_MS;
}
