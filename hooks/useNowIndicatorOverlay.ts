"use client";

import type { CalendarApi } from "@fullcalendar/core";
import type FullCalendar from "@fullcalendar/react";
import type { RefObject } from "react";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { dayDateForColumn, sameLocalCalendarDay } from "@/lib/timeGridDragSelect";

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

export function useNowIndicatorOverlay({
  wrapRef,
  calendarRef,
  isMobile,
  enabled,
  layoutEpoch,
}: Args): NowIndicatorOverlayState | null {
  const [state, setState] = useState<NowIndicatorOverlayState | null>(null);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const cal = calendarRef.current;
    if (!enabled || !wrap || !cal) {
      startTransition(() => setState(null));
      return;
    }

    const api = cal.getApi() as CalendarApi;
    const line = wrap.querySelector(
      ".fc-timegrid-now-indicator-line",
    ) as HTMLElement | null;
    if (!line) {
      startTransition(() => setState(null));
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
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
        centerY,
        thinLeft,
        thinWidth,
        showThin,
        todayLeft,
        todayWidth,
      }),
    );
  }, [enabled, isMobile, wrapRef, calendarRef]);

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
      measure();
    });
    ro.observe(wrap);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, measure, wrapRef]);

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
