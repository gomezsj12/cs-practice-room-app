/**
 * @file Custom "now indicator" overlay hook.
 *
 * FullCalendar renders its own now-indicator line
 * (`.fc-timegrid-now-indicator-line`), but its styling and layer position
 * are difficult to override. This hook **measures** the native indicator's
 * vertical position and the column geometry, then exposes pixel coordinates
 * so an absolutely-positioned React overlay can render a styled replacement
 * on top.
 *
 * ## What triggers re-measurement
 *
 * | Trigger | Why |
 * |---------|-----|
 * | `layoutEpoch` change | Parent bumps this after FullCalendar finishes rendering a new date range or view switch. |
 * | `visibilitychange` → `"visible"` | The native indicator may have moved while the tab was hidden. |
 * | `ResizeObserver` on wrap / `window.resize` | Column widths change on viewport resize (measure coalesced to one rAF per frame). |
 * | 30 s interval | Keeps the overlay in sync as time advances (FullCalendar moves its own line). |
 *
 * ## Measurement strategy
 *
 * `measure()` reads the **native** indicator line's `getBoundingClientRect`,
 * converts it to `scrollTop`-relative coordinates within the wrapper, then
 * reads column rects to derive the thin-line (full-width) and today-column
 * bounds. On desktop, both a full-width thin line and a thicker today-column
 * line are shown; on mobile only the today-column line is shown.
 *
 * State updates are wrapped in `startTransition` to avoid blocking user
 * interactions (drag-select) during re-measurement. Pixel fields are rounded
 * so subpixel layout noise does not flip overlay positions frame-to-frame.
 *
 * @see The `NowIndicatorOverlay` component that consumes this state.
 */
"use client";

import type { CalendarApi } from "@fullcalendar/core";
import type FullCalendar from "@fullcalendar/react";
import type { RefObject } from "react";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { dayDateForColumn, sameLocalCalendarDay } from "@/lib/timeGridDragSelect";

/** Pixel measurements for rendering the now-indicator overlay. */
export type NowIndicatorOverlayState = {
  centerY: number;
  thinLeft: number;
  thinWidth: number;
  showThin: boolean;
  todayLeft: number;
  todayWidth: number;
};

type Args = {
  wrapRef: RefObject<HTMLElement | null>;
  calendarRef: RefObject<FullCalendar | null>;
  isMobile: boolean;
  enabled: boolean;
  layoutEpoch: number;
};

/**
 * Measures FullCalendar's native now-indicator line and column geometry,
 * returning pixel coordinates for the React overlay replacement.
 *
 * @param args.wrapRef      - Scrollable calendar wrapper (coordinate origin).
 * @param args.calendarRef  - FullCalendar instance for API / column mapping.
 * @param args.isMobile     - When true, the full-width thin line is hidden.
 * @param args.enabled      - Master toggle; returns `null` when false.
 * @param args.layoutEpoch  - Bumped by the parent to trigger re-measurement
 *                            after calendar renders complete.
 * @returns Overlay geometry, or `null` when disabled / unmeasurable.
 */
export function useNowIndicatorOverlay({
  wrapRef,
  calendarRef,
  isMobile,
  enabled,
  layoutEpoch,
}: Args): NowIndicatorOverlayState | null {
  const [state, setState] = useState<NowIndicatorOverlayState | null>(null);
  const deferredMeasureRaf = useRef(0);

  /**
   * Read the native now-indicator line's position and the day-column
   * bounding rects, then compute overlay coordinates relative to the
   * scrollable wrapper.
   */
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const cal = calendarRef.current;
    if (!enabled || !wrap || !cal) {
      startTransition(() => setState(null));
      return;
    }

    const api = cal.getApi() as CalendarApi;
    // The native indicator is the single source of truth for the vertical
    // position — we piggyback on FC's internal time → pixel calculation.
    const line = wrap.querySelector(
      ".fc-timegrid-now-indicator-line",
    ) as HTMLElement | null;
    if (!line) {
      startTransition(() => setState(null));
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    // Convert viewport-relative lineRect to scroll-content coordinates
    // within the wrapper.
    const centerY =
      lineRect.top - wrapRect.top + lineRect.height / 2 + wrap.scrollTop;

    const cols = wrap.querySelectorAll(
      ".fc-timegrid-body .fc-timegrid-col:not(.fc-timegrid-axis)",
    ) as NodeListOf<HTMLElement>;
    if (cols.length === 0) {
      startTransition(() => setState(null));
      return;
    }

    const today = new Date();
    // Find today's column by comparing calendar-date for each visible column
    // against the local date. Returns null if today is not in the visible range.
    let todayIdx = -1;
    for (let i = 0; i < cols.length; i++) {
      if (sameLocalCalendarDay(dayDateForColumn(api, i), today)) {
        todayIdx = i;
        break;
      }
    }
    if (todayIdx < 0) {
      startTransition(() => setState(null));
      return;
    }

    const firstCol = cols[0];
    const lastCol = cols[cols.length - 1];
    const todayCol = cols[todayIdx];
    const fr = firstCol.getBoundingClientRect();
    const lr = lastCol.getBoundingClientRect();
    const tr = todayCol.getBoundingClientRect();

    const thinLeft = fr.left - wrapRect.left + wrap.scrollLeft;
    const thinWidth = lr.right - fr.left;
    const todayLeft = tr.left - wrapRect.left + wrap.scrollLeft;
    const todayWidth = tr.width;

    const showThin = !isMobile;

    startTransition(() =>
      setState({
        centerY: Math.round(centerY),
        thinLeft: Math.round(thinLeft),
        thinWidth: Math.round(thinWidth),
        showThin,
        todayLeft: Math.round(todayLeft),
        todayWidth: Math.round(todayWidth),
      }),
    );
  }, [enabled, isMobile, wrapRef, calendarRef]);

  const scheduleMeasure = useCallback(() => {
    if (deferredMeasureRaf.current) {
      return;
    }
    deferredMeasureRaf.current = requestAnimationFrame(() => {
      deferredMeasureRaf.current = 0;
      measure();
    });
  }, [measure]);

  // Synchronous measurement after calendar layout completes (layoutEpoch)
  // to avoid a single frame of stale overlay position.
  useLayoutEffect(() => {
    measure();
  }, [measure, layoutEpoch]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        measure();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, measure]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }

    const ro = new ResizeObserver(() => {
      scheduleMeasure();
    });
    ro.observe(wrap);
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (deferredMeasureRaf.current) {
        cancelAnimationFrame(deferredMeasureRaf.current);
        deferredMeasureRaf.current = 0;
      }
    };
  }, [enabled, scheduleMeasure, wrapRef]);

  // Periodic re-measurement so the overlay tracks FC's native line as it
  // advances with real time. 30 s strikes a balance between visual accuracy
  // and avoiding unnecessary layout reads.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const id = window.setInterval(() => {
      measure();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [enabled, measure]);

  return state;
}
