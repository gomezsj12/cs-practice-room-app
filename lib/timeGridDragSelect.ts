/** Helpers for custom time-grid drag-select (walls at max duration and busy events). */

import type { CalendarApi } from "@fullcalendar/core";

export const SLOT_MIN_STR = "12:00:00";
export const SLOT_MAX_STR = "24:00:00";
export const SNAP_MINUTES = 15;
export const MIN_BOOKING_MS = 30 * 60 * 1000;
export const MAX_BOOKING_MS = 6 * 60 * 60 * 1000;

/** Latest 15-minute snap that still lies on the booking day (avoids setHours(24) → next day). */
export function lastSnappedMinuteBeforeSlotMax(slotMaxMin: number): number {
  return snapMinutes(slotMaxMin - SNAP_MINUTES, SNAP_MINUTES);
}

/** Clamp selection end to the last snapped instant on `start`'s local calendar day. */
export function clampEndToGridDay(
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

export function parseSlotTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  const s = Number(parts[2] ?? 0);
  return h * 60 + m + s / 60;
}

const SLOT_MAX_MINUTES = parseSlotTimeToMinutes(SLOT_MAX_STR);

export function snapMinutes(value: number, snap: number): number {
  return Math.round(value / snap) * snap;
}

export function sameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfLocalCalendarDay(d: Date): Date {
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
export function floorLocalTimeToSnap(d: Date, snapMinutes: number): Date {
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
 * If merged range starts before the earliest bookable instant for that column day,
 * bump `start` up and re-apply the same clipping rules as {@link mergeSelectionRange}.
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

  if (start.getTime() >= minStart.getTime()) {
    return merged;
  }

  start = new Date(minStart);
  if (start.getTime() >= end.getTime()) {
    return null;
  }

  start = clipSelectionStart(start, end, blockers);
  if (start.getTime() >= end.getTime()) {
    return null;
  }

  end = clipSelectionEnd(start, end, blockers);
  if (start.getTime() >= end.getTime()) {
    return null;
  }

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

export function dateAtLocalMinutes(dayMidnight: Date, minutesFromMidnight: number): Date {
  const d = new Date(dayMidnight);
  d.setHours(0, 0, 0, 0);
  const h = Math.floor(minutesFromMidnight / 60);
  const m = Math.round(minutesFromMidnight - h * 60);
  d.setHours(h, m, 0, 0);
  return d;
}

export function localMinutesFromDate(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

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
 * Advance `start` to the first free instant while it lies inside a busy block [es, ee).
 * Use when dragging upward so the range does not visually overlap practice/jam blocks.
 */
export function clipSelectionStart(
  start: Date,
  end: Date,
  blockers: BlockingInterval[],
): Date {
  let startMs = start.getTime();
  const endMs = end.getTime();
  if (startMs >= endMs) {
    return new Date(startMs);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const ev of blockers) {
      const es = new Date(ev.start).getTime();
      const ee = new Date(ev.end).getTime();
      if (!sameLocalCalendarDay(new Date(startMs), new Date(ev.start))) {
        continue;
      }
      if (es >= endMs || ee <= startMs) {
        continue;
      }
      if (startMs >= es && startMs < ee) {
        startMs = Math.max(startMs, ee);
        changed = true;
      }
    }
  }

  return new Date(Math.min(startMs, endMs));
}

/**
 * Clip selection end so [start, end) does not cross into busy blocks or past 6h.
 * Handles blocks that start after `start` and blocks that enclose `start` (left edge).
 */
export function clipSelectionEnd(
  start: Date,
  end: Date,
  blockers: BlockingInterval[],
): Date {
  let endMs = end.getTime();
  const startMs = start.getTime();
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
    if (es > startMs) {
      endMs = Math.min(endMs, es);
    }
    if (ee > startMs && ee < endMs) {
      endMs = Math.min(endMs, ee);
    }
  }

  return new Date(Math.max(endMs, startMs));
}

/**
 * Builds a bookable [start, end) from drag/extents. Returns null when there is
 * not enough contiguous free time for {@link MIN_BOOKING_MS} (e.g. 15-minute gap
 * before the next event).
 */
export function mergeSelectionRange(
  anchor: Date,
  pointer: Date,
  blockers: BlockingInterval[],
): { start: Date; end: Date } | null {
  let start = new Date(Math.min(anchor.getTime(), pointer.getTime()));
  let end = new Date(Math.max(anchor.getTime(), pointer.getTime()));

  if (end.getTime() - start.getTime() < SNAP_MINUTES * 60 * 1000) {
    end = new Date(start.getTime() + MIN_BOOKING_MS);
  }

  start = clipSelectionStart(start, end, blockers);

  if (start.getTime() >= end.getTime()) {
    return null;
  }

  end = clipSelectionEnd(start, end, blockers);

  if (start.getTime() >= end.getTime()) {
    return null;
  }

  if (end.getTime() - start.getTime() < MIN_BOOKING_MS) {
    end = clipSelectionEnd(start, new Date(start.getTime() + MIN_BOOKING_MS), blockers);
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
export function getSharedTimeGridSlotsEl(
  calendarRoot: HTMLElement,
): HTMLElement | null {
  return (
    (calendarRoot.querySelector(
      ".fc-timegrid-body .fc-timegrid-slots",
    ) as HTMLElement | null) ??
    (calendarRoot.querySelector(".fc-timegrid-slots") as HTMLElement | null)
  );
}

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

export function minutesOnDayToDate(dayDate: Date, minutesFromMidnight: number): Date {
  return dateAtLocalMinutes(new Date(dayDate), minutesFromMidnight);
}

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
  if (!sameLocalCalendarDay(start, end) || em <= sm) {
    em = lastSnappedMinuteBeforeSlotMax(slotMaxMin);
  }
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

export function selectionIsBookable(start: Date, end: Date): boolean {
  const ms = end.getTime() - start.getTime();
  return ms >= MIN_BOOKING_MS && ms <= MAX_BOOKING_MS;
}
