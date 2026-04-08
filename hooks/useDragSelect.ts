import { useEffect, useState } from "react";
import type FullCalendar from "@fullcalendar/react";
import type { CalendarEvent, DragMirrorState, PendingSelection } from "@/lib/types";
import {
  makeOptimisticHoldEvent,
  stripOptimisticHoldEvents,
} from "@/lib/hold-helpers";
import {
  SLOT_MAX_STR,
  SLOT_MIN_STR,
  applyMinBookableStartToRange,
  clientYToSnappedMinutes,
  dayDateForColumn,
  earliestBookableStartForColumnDay,
  findBodyColumnIndex,
  isInstantInsideBusy,
  isPastCalendarDay,
  mergeSelectionRange,
  mirrorBoundsForRange,
  minutesOnDayToDate,
  parseSlotTimeToMinutes,
  selectionIsBookable,
} from "@/lib/timeGridDragSelect";

function formatEventTimeRange(start: Date | null, end: Date | null) {
  if (!start || !end) {
    return "";
  }

  const startText = start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const endText = end.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const [startClock, startMeridiem] = startText.split(" ");
  const [endClock, endMeridiem] = endText.split(" ");

  if (startMeridiem === endMeridiem) {
    return `${startClock} - ${endClock} ${endMeridiem}`;
  }

  return `${startText} - ${endText}`;
}

export function useDragSelect(
  calendarRef: React.RefObject<FullCalendar | null>,
  calendarInteractRef: React.RefObject<HTMLDivElement | null>,
  isLoading: boolean,
  eventsRef: React.RefObject<CalendarEvent[]>,
  pendingSelectionRef: React.RefObject<PendingSelection | null>,
  statusRef: React.RefObject<"loading" | "authenticated" | "unauthenticated">,
  createHoldOrFallbackRef: React.RefObject<
    (start: Date, end: Date) => Promise<void>
  >,
  showToast: (message: string, type: "success" | "error" | "info") => void,
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>,
) {
  const [dragMirror, setDragMirror] = useState<DragMirrorState | null>(null);
  const [isDragInteracting, setIsDragInteracting] = useState(false);

  useEffect(() => {
    const root = calendarInteractRef.current;
    if (!root || isLoading) {
      return;
    }

    const interactRoot: HTMLElement = root;

    const slotMinMin = parseSlotTimeToMinutes(SLOT_MIN_STR);
    const slotMaxMin = parseSlotTimeToMinutes(SLOT_MAX_STR);

    const TOUCH_ARM_MS = 220;
    const TOUCH_MOVE_CANCEL_PX = 10;

    type ActiveDrag = {
      colEl: HTMLElement;
      colIdx: number;
      pointerId: number;
      pointerType: string;
      anchor: Date;
      blockers: { start: string; end: string }[];
    };

    let active: ActiveDrag | null = null;
    let rafId = 0;
    let lastClientY = 0;
    let lastMirrorKey = "";

    type TouchActive = {
      colEl: HTMLElement;
      colIdx: number;
      anchor: Date;
      blockers: { start: string; end: string }[];
      identifier: number;
    };
    type TouchPending = {
      startX: number;
      startY: number;
      colEl: HTMLElement;
      colIdx: number;
      anchor: Date;
      blockers: { start: string; end: string }[];
      timeoutId: number;
      armed: boolean;
      identifier: number;
    };

    let touchActive: TouchActive | null = null;
    let touchPending: TouchPending | null = null;
    let dragInteracting = false;

    function setDragInteracting(next: boolean) {
      if (dragInteracting === next) {
        return;
      }
      dragInteracting = next;
      setIsDragInteracting(next);
    }

    function buildBlockers(): { start: string; end: string }[] {
      return eventsRef.current.map((ev) => ({ start: ev.start, end: ev.end }));
    }

    function cleanupTouchPending() {
      if (!touchPending) {
        return;
      }
      window.clearTimeout(touchPending.timeoutId);
      touchPending = null;
    }

    function paintMirror() {
      rafId = 0;
      if (!calendarRef.current) {
        return;
      }

      const source = active
        ? {
            colEl: active.colEl,
            colIdx: active.colIdx,
            anchor: active.anchor,
            blockers: active.blockers,
          }
        : touchActive
          ? {
              colEl: touchActive.colEl,
              colIdx: touchActive.colIdx,
              anchor: touchActive.anchor,
              blockers: touchActive.blockers,
            }
          : null;

      if (!source) {
        return;
      }

      const api = calendarRef.current.getApi();
      const dayDate = dayDateForColumn(api, source.colIdx);
      const pm = clientYToSnappedMinutes(
        lastClientY,
        interactRoot,
        slotMinMin,
        slotMaxMin,
      );
      const pointerDate = minutesOnDayToDate(dayDate, pm);
      const mergedRaw = mergeSelectionRange(
        source.anchor,
        pointerDate,
        source.blockers,
      );

      const now = new Date();
      const merged = applyMinBookableStartToRange(
        mergedRaw,
        dayDate,
        now,
        slotMinMin,
        source.blockers,
      );

      if (!merged) {
        setDragMirror(null);
        lastMirrorKey = "";
        return;
      }

      const { start, end } = merged;
      const b = mirrorBoundsForRange(
        source.colEl,
        interactRoot,
        start,
        end,
        slotMinMin,
        slotMaxMin,
      );
      if (!b) {
        return;
      }

      const key = `${b.top.toFixed(1)}|${b.left.toFixed(1)}|${b.width.toFixed(
        1,
      )}|${b.height.toFixed(1)}|${start.toISOString()}|${end.toISOString()}`;
      if (key === lastMirrorKey) {
        return;
      }
      lastMirrorKey = key;

      setDragMirror({
        ...b,
        label: formatEventTimeRange(start, end),
      });
    }

    function schedulePaint() {
      if (rafId) {
        return;
      }
      rafId = requestAnimationFrame(paintMirror);
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) {
        return;
      }
      if ((e.pointerType || "mouse") === "touch") {
        // Touch uses the dedicated touch listeners only; handling both Pointer
        // and touch completion caused duplicate holds on mobile.
        return;
      }
      const el = e.target as HTMLElement;
      if (
        el.closest(
          "button,a,[role='button'],.fc-event,.fc-timegrid-event-harness",
        )
      ) {
        return;
      }
      if (pendingSelectionRef.current) {
        return;
      }

      if (active) {
        return;
      }

      const hit = findBodyColumnIndex(interactRoot, e.clientX, e.clientY);
      if (!hit || !calendarRef.current) {
        return;
      }

      const api = calendarRef.current.getApi();
      const dayDate = dayDateForColumn(api, hit.index);
      const am = clientYToSnappedMinutes(
        e.clientY,
        interactRoot,
        slotMinMin,
        slotMaxMin,
      );
      const anchor = minutesOnDayToDate(dayDate, am);
      const blockersNow = buildBlockers();

      if (isInstantInsideBusy(anchor, blockersNow)) {
        showToast("That time is already booked. Try another spot.", "info");
        return;
      }

      if (isPastCalendarDay(dayDate)) {
        showToast("You can\u2019t reserve time on past days.", "info");
        return;
      }

      const minStart = earliestBookableStartForColumnDay(
        dayDate,
        new Date(),
        slotMinMin,
      );
      if (anchor.getTime() < minStart.getTime()) {
        showToast(
          "That time has already passed for booking. Pick a later slot.",
          "info",
        );
        return;
      }

      const pointerType = e.pointerType || "mouse";

      // Mouse/pen: arm immediately for a snappy desktop feel.
      active = {
        colEl: hit.col,
        colIdx: hit.index,
        pointerId: e.pointerId,
        pointerType,
        anchor,
        blockers: blockersNow,
      };
      setDragInteracting(true);
      lastClientY = e.clientY;
      interactRoot.style.touchAction = "none";
      try {
        interactRoot.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      schedulePaint();
    }

    function onPointerMove(e: PointerEvent) {
      if (!active || e.pointerId !== active.pointerId) {
        return;
      }

      lastClientY = e.clientY;
      schedulePaint();
    }

    function completeSelection(
      colIdx: number,
      anchor: Date,
      blockers: { start: string; end: string }[],
      endClientY: number,
    ) {
      if (!calendarRef.current) {
        return;
      }

      const api = calendarRef.current.getApi();
      const dayDate = dayDateForColumn(api, colIdx);
      const pm = clientYToSnappedMinutes(
        endClientY,
        interactRoot,
        slotMinMin,
        slotMaxMin,
      );
      const pointerDate = minutesOnDayToDate(dayDate, pm);
      const mergedRaw = mergeSelectionRange(anchor, pointerDate, blockers);

      const now = new Date();
      const merged = applyMinBookableStartToRange(
        mergedRaw,
        dayDate,
        now,
        slotMinMin,
        blockers,
      );

      if (!merged) {
        showToast(
          "There isn\u2019t 30 minutes of open time before the next booking here. Try another spot or time.",
          "info",
        );
        return;
      }

      if (isPastCalendarDay(merged.start)) {
        return;
      }

      if (!selectionIsBookable(merged.start, merged.end)) {
        return;
      }

      if (statusRef.current !== "authenticated") {
        showToast("Sign in with Google to reserve the room.", "info");
        return;
      }

      setEvents((prev) => [
        ...stripOptimisticHoldEvents(prev),
        makeOptimisticHoldEvent(merged.start, merged.end),
      ]);
      void createHoldOrFallbackRef.current(merged.start, merged.end);
    }

    function finishPointer(e: PointerEvent) {
      if (!active || e.pointerId !== active.pointerId) {
        return;
      }

      const saved = active;
      active = null;
      setDragInteracting(false);

      try {
        interactRoot.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      interactRoot.style.touchAction = "manipulation";

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setDragMirror(null);
      lastMirrorKey = "";

      completeSelection(saved.colIdx, saved.anchor, saved.blockers, e.clientY);
    }

    // Touch fallback: many mobile browsers (esp. iOS) don't reliably "switch"
    // to drag mode mid-gesture via touch-action changes. Handle touch directly.
    function getTouchById(list: TouchList, id: number): Touch | null {
      for (let i = 0; i < list.length; i++) {
        const t = list.item(i);
        if (t && t.identifier === id) {
          return t;
        }
      }
      return null;
    }

    function finishTouchAt(endClientY: number) {
      const saved = touchActive;
      touchActive = null;
      setDragInteracting(false);
      cleanupTouchPending();

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setDragMirror(null);
      lastMirrorKey = "";
      interactRoot.style.touchAction = "manipulation";

      if (!saved) {
        return;
      }

      completeSelection(saved.colIdx, saved.anchor, saved.blockers, endClientY);
    }

    function onTouchStart(e: TouchEvent) {
      if (pendingSelectionRef.current) {
        return;
      }
      if (touchActive || touchPending) {
        return;
      }
      if (e.touches.length !== 1) {
        return;
      }
      const t = e.touches.item(0);
      if (!t) {
        return;
      }

      const el = e.target as HTMLElement;
      if (
        el.closest(
          "button,a,[role='button'],.fc-event,.fc-timegrid-event-harness",
        )
      ) {
        return;
      }

      const hit = findBodyColumnIndex(interactRoot, t.clientX, t.clientY);
      if (!hit || !calendarRef.current) {
        return;
      }

      const api = calendarRef.current.getApi();
      const dayDate = dayDateForColumn(api, hit.index);
      const am = clientYToSnappedMinutes(
        t.clientY,
        interactRoot,
        slotMinMin,
        slotMaxMin,
      );
      const anchor = minutesOnDayToDate(dayDate, am);
      const blockersNow = buildBlockers();

      const timeoutId = window.setTimeout(() => {
        if (!touchPending || touchPending.armed) {
          return;
        }

        // Only show "not available" toasts once the user has clearly indicated
        // intent to drag-select (long-press arms drag mode). This prevents
        // swipe/double-tap navigation gestures from triggering booking toasts.
        if (!calendarRef.current) {
          cleanupTouchPending();
          return;
        }
        const apiNow = calendarRef.current.getApi();
        const dayDateNow = dayDateForColumn(apiNow, touchPending.colIdx);
        const minStartTouchNow = earliestBookableStartForColumnDay(
          dayDateNow,
          new Date(),
          slotMinMin,
        );

        if (isInstantInsideBusy(touchPending.anchor, touchPending.blockers)) {
          showToast("That time is already booked. Try another spot.", "info");
          cleanupTouchPending();
          return;
        }
        if (isPastCalendarDay(dayDateNow)) {
          showToast("You can\u2019t reserve time on past days.", "info");
          cleanupTouchPending();
          return;
        }
        if (touchPending.anchor.getTime() < minStartTouchNow.getTime()) {
          showToast(
            "That time has already passed for booking. Pick a later slot.",
            "info",
          );
          cleanupTouchPending();
          return;
        }

        touchPending.armed = true;
        touchActive = {
          colEl: touchPending.colEl,
          colIdx: touchPending.colIdx,
          anchor: touchPending.anchor,
          blockers: touchPending.blockers,
          identifier: touchPending.identifier,
        };
        setDragInteracting(true);
        lastClientY = touchPending.startY;
        interactRoot.style.touchAction = "none";
        schedulePaint();
      }, TOUCH_ARM_MS);

      touchPending = {
        startX: t.clientX,
        startY: t.clientY,
        colEl: hit.col,
        colIdx: hit.index,
        anchor,
        blockers: blockersNow,
        timeoutId,
        armed: false,
        identifier: t.identifier,
      };
      lastClientY = t.clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (touchPending && !touchPending.armed) {
        const t = getTouchById(e.touches, touchPending.identifier);
        if (!t) {
          return;
        }
        lastClientY = t.clientY;
        const dx = t.clientX - touchPending.startX;
        const dy = t.clientY - touchPending.startY;
        const dist = Math.hypot(dx, dy);
        if (dist > TOUCH_MOVE_CANCEL_PX) {
          cleanupTouchPending();
        }
        return;
      }

      if (!touchActive) {
        return;
      }

      const t = getTouchById(e.touches, touchActive.identifier);
      if (!t) {
        return;
      }

      // Once armed, prevent scrolling so drag stays responsive.
      e.preventDefault();
      lastClientY = t.clientY;
      schedulePaint();
    }

    function onTouchEnd(e: TouchEvent) {
      if (touchPending && !touchPending.armed) {
        cleanupTouchPending();
        return;
      }
      if (!touchActive) {
        return;
      }
      const t =
        getTouchById(e.changedTouches, touchActive.identifier) ??
        e.changedTouches.item(0);
      if (!t) {
        finishTouchAt(lastClientY);
        return;
      }
      finishTouchAt(t.clientY);
    }

    function onTouchCancel() {
      cleanupTouchPending();
      touchActive = null;
      setDragInteracting(false);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setDragMirror(null);
      lastMirrorKey = "";
      interactRoot.style.touchAction = "manipulation";
    }

    interactRoot.style.touchAction = "manipulation";
    interactRoot.addEventListener("pointerdown", onPointerDown);
    interactRoot.addEventListener("pointermove", onPointerMove, {
      passive: false,
    });
    interactRoot.addEventListener("pointerup", finishPointer);
    interactRoot.addEventListener("pointercancel", finishPointer);
    interactRoot.addEventListener("touchstart", onTouchStart, {
      passive: true,
    });
    interactRoot.addEventListener("touchmove", onTouchMove, {
      passive: false,
    });
    interactRoot.addEventListener("touchend", onTouchEnd, {
      passive: true,
    });
    interactRoot.addEventListener("touchcancel", onTouchCancel, {
      passive: true,
    });

    return () => {
      cleanupTouchPending();
      interactRoot.removeEventListener("pointerdown", onPointerDown);
      interactRoot.removeEventListener("pointermove", onPointerMove);
      interactRoot.removeEventListener("pointerup", finishPointer);
      interactRoot.removeEventListener("pointercancel", finishPointer);
      interactRoot.removeEventListener("touchstart", onTouchStart);
      interactRoot.removeEventListener("touchmove", onTouchMove);
      interactRoot.removeEventListener("touchend", onTouchEnd);
      interactRoot.removeEventListener("touchcancel", onTouchCancel);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      interactRoot.style.touchAction = "manipulation";
      setDragMirror(null);
      setIsDragInteracting(false);
    };
  }, [
    calendarRef,
    calendarInteractRef,
    isLoading,
    eventsRef,
    pendingSelectionRef,
    statusRef,
    createHoldOrFallbackRef,
    showToast,
    setEvents,
  ]);

  return { dragMirror, formatEventTimeRange, isDragInteracting };
}
