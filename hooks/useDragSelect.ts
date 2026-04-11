/**
 * @file Drag-to-select hook for the FullCalendar time-grid.
 *
 * Implements two **mutually exclusive** input paths:
 *
 * ### Pointer path (mouse / pen)
 * Fires on `pointerdown` for non-touch pointers. Arms immediately, captures
 * the pointer, and tracks `pointermove` until `pointerup` / `pointercancel`.
 * Touch-type pointers are explicitly rejected here to avoid duplicate
 * completions — see below.
 *
 * ### Touch path (dedicated Touch events)
 * Many mobile browsers (especially iOS Safari) do not reliably honour
 * mid-gesture `touch-action` changes made during a Pointer Events sequence.
 * The touch path works around this by listening to native `touchstart`,
 * `touchmove`, `touchend`, and `touchcancel` directly.
 *
 * A **long-press arming mechanism** (`TOUCH_ARM_MS`) distinguishes intentional
 * drag-selects from scrolls and navigation gestures. While the timer is
 * pending, any movement beyond `TOUCH_MOVE_CANCEL_PX` cancels the gesture
 * entirely. Once armed, `touchActive` is set, `touch-action: none` is
 * applied, and scrolling is suppressed via `preventDefault`.
 *
 * ### RAF-driven mirror painting
 * Both paths feed into `schedulePaint → paintMirror`, which runs at most once
 * per animation frame. `paintMirror` reads the latest `lastClientY`, maps it
 * to a snapped time, merges the range around the anchor while respecting
 * existing event blockers, and emits a `DragMirrorState` for the visual
 * overlay. A string-key dedup (`lastMirrorKey`) prevents unnecessary React
 * state updates when the computed bounds haven't changed.
 *
 * ### `completeSelection` validation chain
 * On pointer-up / touch-end, the final range goes through:
 * 1. `mergeSelectionRange` — clamp to the nearest blocker boundaries.
 * 2. `applyMinBookableStartToRange` — shift start forward if it falls in the
 *    past.
 * 3. `isPastCalendarDay` — reject if the entire day is in the past.
 * 4. `selectionIsBookable` — reject if the range is shorter than the minimum
 *    booking duration (30 min).
 * 5. Auth check — only authenticated users may proceed.
 *
 * If all checks pass, an optimistic hold event is injected and the booking
 * flow is kicked off via `createHoldOrFallbackRef`.
 *
 * @see {@link useBookingFlow} for what happens after `createHoldOrFallbackRef`
 *      is called.
 * @see `lib/timeGridDragSelect` for the pure geometry / time-math helpers.
 */
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
  applyFridayJamCutoffToRange,
  applyMinBookableStartToRange,
  clientYToSnappedMinutes,
  dayDateForColumn,
  earliestBookableStartForColumnDay,
  findBodyColumnIndex,
  fridayJamLatestEndOnDay,
  isFridayLocalDay,
  isInstantInsideBusy,
  isPastCalendarDay,
  mergeSelectionRange,
  mirrorBoundsForRange,
  minutesOnDayToDate,
  parseSlotTimeToMinutes,
  selectionIsBookable,
} from "@/lib/timeGridDragSelect";

/** Formats a start/end pair into a compact range label (e.g. "2:00 - 3:30 PM"),
 *  collapsing the meridiem when both times share the same AM/PM. */
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

/**
 * Wires up pointer and touch listeners on the calendar time-grid to enable
 * drag-to-select booking. Returns the current drag-mirror overlay state and
 * a flag indicating whether a drag gesture is in progress.
 *
 * All parameters are stable refs or callbacks to keep the single large
 * `useEffect` dependency array static across renders.
 *
 * @param calendarRef          - Ref to the FullCalendar instance (for API access).
 * @param calendarInteractRef  - Ref to the DOM wrapper that receives pointer/touch events.
 * @param isLoading            - While true, listeners are not attached.
 * @param eventsRef            - Stable ref to the latest events array (blocker source).
 * @param pendingSelectionRef  - When non-null, new drags are blocked.
 * @param statusRef            - Auth status ref; only `"authenticated"` can complete a selection.
 * @param createHoldOrFallbackRef - Booking-flow entry point called on successful selection.
 * @param showToast            - Toast callback for validation messages.
 * @param setEvents            - State setter for injecting the optimistic hold event.
 */
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

    /** Long-press duration (ms) before a touch gesture becomes a drag-select. */
    const TOUCH_ARM_MS = 220;
    /** Movement threshold (px) that cancels a pending long-press. */
    const TOUCH_MOVE_CANCEL_PX = 10;

    type ActiveDrag = {
      colEl: HTMLElement;
      colIdx: number;
      pointerId: number;
      pointerType: string;
      anchor: Date;
      blockers: { start: string; end: string }[];
    };

    // --- Pointer-path mutable state ---
    let active: ActiveDrag | null = null;
    /** Non-zero when a `paintMirror` frame is already scheduled. */
    let rafId = 0;
    /** Shared across both input paths — written on every move, read by `paintMirror`. */
    let lastClientY = 0;
    /** Dedup key to skip `setDragMirror` when bounds haven't changed. */
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

    // --- Touch-path mutable state ---
    let touchActive: TouchActive | null = null;
    /** Pre-arm state: tracks the initial touch while the long-press timer runs. */
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

    /**
     * Compute and emit the drag-mirror overlay position.
     *
     * Reads from whichever input path is active (pointer or touch), maps
     * `lastClientY` to a time, merges around blockers, and updates
     * `dragMirror` state only when the resulting bounds actually change.
     */
    function paintMirror() {
      rafId = 0;
      if (!calendarRef.current) {
        return;
      }

      // Unify both input paths into a single source for the geometry math.
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
      const merged = applyFridayJamCutoffToRange(
        applyMinBookableStartToRange(
          mergedRaw,
          dayDate,
          now,
          slotMinMin,
          source.blockers,
        ),
        dayDate,
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

      if (isFridayLocalDay(dayDate)) {
        const friCap = fridayJamLatestEndOnDay(dayDate);
        if (anchor.getTime() >= friCap.getTime()) {
          showToast(
            "Jam reservations on Fridays end by 2:30 PM. Pick an earlier time.",
            "info",
          );
          return;
        }
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

    /**
     * Validate and finalize the drag range, then kick off the booking flow.
     *
     * Runs the full validation chain: merge → min-bookable-start clamp →
     * past-day check → minimum-duration check → auth check. On success,
     * injects an optimistic hold event and calls `createHoldOrFallbackRef`.
     */
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
      const merged = applyFridayJamCutoffToRange(
        applyMinBookableStartToRange(
          mergedRaw,
          dayDate,
          now,
          slotMinMin,
          blockers,
        ),
        dayDate,
      );

      if (!merged) {
        showToast(
          isFridayLocalDay(dayDate)
            ? "On Fridays, jam sessions must end by 2:30 PM. Try an earlier time or a shorter slot."
            : "There isn\u2019t 30 minutes of open time before the next booking here. Try another spot or time.",
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

    // --- Touch path entry point ---
    // Starts a long-press timer; if the user holds still for TOUCH_ARM_MS
    // the gesture is promoted to an active drag-select.
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

        if (isFridayLocalDay(dayDateNow)) {
          const friCapTouch = fridayJamLatestEndOnDay(dayDateNow);
          if (touchPending.anchor.getTime() >= friCapTouch.getTime()) {
            showToast(
              "Jam reservations on Fridays end by 2:30 PM. Pick an earlier time.",
              "info",
            );
            cleanupTouchPending();
            return;
          }
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
      // While the long-press timer is still running, any movement beyond
      // TOUCH_MOVE_CANCEL_PX cancels the pending drag so normal scrolling
      // can proceed unimpeded.
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
