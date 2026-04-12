"use client";

/**
 * @module CalendarView
 *
 * Top-level calendar orchestrator for the Calendar page (`/calendar`).
 *
 * Renders a FullCalendar (timeGridWeek on desktop, timeGridDay on mobile)
 * wrapped in custom navigation controls, a drag-select reservation flow,
 * and stacked modal overlays (reserve, event details, cancel confirmation,
 * toast).
 *
 * **Keyboard shortcuts** (desktop only, suppressed when a modal is open or
 * focus is in a form field):
 * - `ArrowLeft` / `ArrowRight` — navigate to previous / next week (or day)
 * - `T` — jump to today
 * - `Escape` — close the topmost open modal (reserve > cancel confirm > event details)
 *
 * **Touch gestures** (mobile only):
 * - Horizontal swipe — navigate prev/next day
 * - Double-tap — jump to today
 *
 * Key hooks consumed:
 * - {@link useBookingFlow} — hold / reserve / cancel state machine
 * - {@link useDragSelect} — pointer-based slot selection on the grid
 * - {@link useEventPolling} — server polling for calendar events
 * - {@link useNowIndicatorOverlay} — custom "now" line rendering
 *
 * @see ReserveModal — opened after a slot is drag-selected
 * @see EventDetailsModal — opened on event click
 * @see ConfirmModal — cancel-reservation confirmation
 */

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DatesSetArg, EventContentArg } from "@fullcalendar/core";
import { addDays, format, parseISO } from "date-fns";
import FullCalendar from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useSession } from "next-auth/react";
import BlockTimeModal from "@/components/BlockTimeModal";
import ConfirmModal from "@/components/ConfirmModal";
import EventDetailsModal from "@/components/EventDetailsModal";
import ReserveModal from "@/components/ReserveModal";
import Toast from "@/components/Toast";
import { useBookingFlow } from "@/hooks/useBookingFlow";
import { useDragSelect } from "@/hooks/useDragSelect";
import { useEventPolling } from "@/hooks/useEventPolling";
import { getCalendarEventKindLabel } from "@/lib/calendar-events";
import {
  useNowIndicatorOverlay,
  type NowIndicatorOverlayState,
} from "@/hooks/useNowIndicatorOverlay";
import { useToast } from "@/hooks/useToast";
import {
  dayDateForColumn,
  FRIDAY_JAM_OVERLAY_START_MINUTES,
  isFridayLocalDay,
  isPastCalendarDay,
  mirrorBoundsFromMinutesToGridBottom,
  parseSlotTimeToMinutes,
  sameLocalCalendarDay,
  SLOT_MAX_STR,
  SLOT_MIN_STR,
} from "@/lib/timeGridDragSelect";
import type { CalendarEvent, PendingSelection } from "@/lib/types";
import { formatBookingDateRange } from "@/lib/formatting";

/** Positions for Friday restriction bands — same coordinate space as {@link useNowIndicatorOverlay} (wrap-relative + scroll). */
type FridayJamOverlayRect = {
  key: string;
  /** ISO date string (YYYY-MM-DD) of the Friday this overlay represents. */
  dateStr: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Checks whether the given event target is an element the user is likely
 * typing into (input, textarea, select, or `contentEditable`).
 *
 * Used as a guard so keyboard shortcuts (arrow keys, "T", Escape) are
 * suppressed while the user is interacting with form fields or editable
 * regions.
 */
/** FullCalendar `validRange.end` is exclusive; quarter `endDate` is inclusive. */
function exclusiveEndAfterInclusiveYmd(endInclusive: string): string {
  return format(addDays(parseISO(endInclusive), 1), "yyyy-MM-dd");
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/** Thin “hairline” height; `scaleY` keeps it sharper than a literal 0.5px on some displays. */
const NOW_THIN_LINE_STYLE: CSSProperties = {
  height: 1,
  transform: "translateY(-50%) scaleY(0.34)",
  transformOrigin: "50% 50%",
  backgroundColor: "rgba(239, 68, 68, 0.88)",
};

/**
 * Custom "now" time-indicator overlay that replaces FullCalendar's built-in
 * red line with a multi-segment design:
 *
 * - A left-pointing triangle arrow at the today column's leading edge
 * - A thick (4 px) red bar spanning most of the today column
 * - Thin hairline segments extending across non-today columns (week view)
 *
 * All segments are absolutely positioned via measurements from
 * {@link useNowIndicatorOverlay} and are `pointer-events: none` so they
 * never interfere with click/drag interactions on the calendar grid.
 *
 * @param props.o - Pre-computed pixel positions and sizes.
 */
function NowIndicatorOverlayLayer({ o }: { o: NowIndicatorOverlayState }) {
  const ARROW_W = 9;
  const ARROW_BY = 4;
  /** Space after arrow tip before thick segment. */
  const GAP_ARROW_TO_THICK = 8;
  /** Inset from today column’s right edge where thick segment ends. */
  const GAP_THICK_INSET_END = 8;
  /** Visible gap after thick before the thin continuation (week view). */
  const GAP_THICK_TO_TRAILING = 8;

  const colStart = o.todayLeft;
  const colW = o.todayWidth;
  const dayGridRight = o.thinLeft + o.thinWidth;

  const leftThinW = Math.max(0, colStart - ARROW_W);
  const thickLeft = colStart + GAP_ARROW_TO_THICK;
  const thickW = Math.max(
    0,
    colW - GAP_ARROW_TO_THICK - GAP_THICK_INSET_END,
  );
  const thickEnd = thickLeft + thickW;
  const rightThinStart = thickEnd + GAP_THICK_TO_TRAILING;
  const rightThinW = Math.max(0, dayGridRight - rightThinStart);

  const showTrailingThin = o.showThin && rightThinW > 0.5;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden
    >
      <div
        className="absolute"
        style={{
          ...NOW_THIN_LINE_STYLE,
          left: 0,
          top: o.centerY,
          width: leftThinW,
        }}
      />

      {showTrailingThin ? (
        <div
          className="absolute"
          style={{
            ...NOW_THIN_LINE_STYLE,
            left: rightThinStart,
            top: o.centerY,
            width: rightThinW,
          }}
        />
      ) : null}

      <div
        className="absolute bg-[#ef4444]"
        style={{
          left: thickLeft,
          top: o.centerY,
          width: thickW,
          height: 4,
          transform: "translateY(-50%)",
        }}
      />

      <div
        className="absolute h-0 w-0 border-y-[4px] border-y-transparent border-l-[9px] border-l-[#ef4444]"
        style={{
          left: colStart - ARROW_W,
          top: o.centerY - ARROW_BY,
        }}
      />
    </div>
  );
}

/**
 * Primary calendar view component.
 *
 * Manages responsive layout (mobile day view vs. desktop week view),
 * wires FullCalendar to the booking-flow hooks, and handles all
 * navigation input (buttons, keyboard shortcuts, touch gestures).
 */
export default function CalendarView() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const calendarInteractRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectionRef = useRef<PendingSelection | null>(null);
  const statusRef = useRef<"loading" | "authenticated" | "unauthenticated">(
    "loading",
  );
  const { data: session, status } = useSession();
  const isAdmin = session?.isAdmin === true;
  const isAdminRef = useRef(false);

  const [isMobile, setIsMobile] = useState(false);
  const [calendarTitle, setCalendarTitle] = useState("");
  /** Bumped after layout-affecting calendar updates so the now overlay can remeasure. */
  const [calendarLayoutEpoch, setCalendarLayoutEpoch] = useState(0);
  /** Friday 2 PM+ restriction bands (wrap-relative coords; refreshed like the now line). */
  const [fridayJamOverlays, setFridayJamOverlays] = useState<
    FridayJamOverlayRect[]
  >([]);
  /** Re-render periodically so “past” event styling updates as time passes. */
  const [nowTick, setNowTick] = useState(() => Date.now());

  /** Admin: pending block-off selection awaiting confirmation. */
  const [adminBlockSelection, setAdminBlockSelection] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  /** Admin: blocked event selected for deletion. */
  const [blockedEventToDelete, setBlockedEventToDelete] =
    useState<CalendarEvent | null>(null);
  const [isBlockSubmitting, setIsBlockSubmitting] = useState(false);
  const [isBlockDeleting, setIsBlockDeleting] = useState(false);

  /** Admin: Friday overlay selected for opening (exception). */
  const [fridayToOpen, setFridayToOpen] = useState<string | null>(null);
  const [isFridayExceptionSubmitting, setIsFridayExceptionSubmitting] =
    useState(false);

  const onAdminBlockRef = useRef<(start: Date, end: Date) => void>(
    () => {},
  );
  onAdminBlockRef.current = (start: Date, end: Date) => {
    setAdminBlockSelection({ start, end });
  };

  const { toast, showToast, closeToast } = useToast();

  const {
    events,
    setEvents,
    isLoading,
    loadEvents,
    eventsRef,
    fridayExceptions,
    fridayExceptionsRef,
    quarter,
  } = useEventPolling(
    showToast,
    status,
    pendingSelectionRef,
    session?.profileUpdatedAt,
  );

  const quarterValidRange = useMemo(() => {
    if (!quarter) {
      return undefined;
    }
    return {
      start: quarter.startDate,
      end: exclusiveEndAfterInclusiveYmd(quarter.endDate),
    };
  }, [quarter]);

  const calendarInstanceKey = useMemo(() => {
    const suffix = quarter
      ? `${quarter.startDate}-${quarter.endDate}`
      : "rolling";
    return isMobile ? `mobile-${suffix}` : `desktop-${suffix}`;
  }, [isMobile, quarter]);

  const {
    pendingSelection,
    selectedEvent,
    setSelectedEvent,
    showCancelConfirm,
    setShowCancelConfirm,
    isSubmitting,
    isCancelling,
    createHoldOrFallbackRef,
    handleReserve,
    handleReserveModalClose,
    handleHoldExpire,
    confirmCancelReservation,
  } = useBookingFlow(
    showToast,
    loadEvents,
    setEvents,
    status,
    pendingSelectionRef,
  );

  const { dragMirror, formatEventTimeRange, isDragInteracting, clearDragMirror } = useDragSelect(
    calendarRef,
    calendarInteractRef,
    isLoading,
    eventsRef,
    pendingSelectionRef,
    statusRef,
    createHoldOrFallbackRef,
    showToast,
    setEvents,
    isAdminRef,
    onAdminBlockRef,
    fridayExceptionsRef,
  );

  const nowIndicatorOverlay = useNowIndicatorOverlay({
    wrapRef: calendarInteractRef,
    calendarRef,
    isMobile,
    enabled: !isLoading,
    layoutEpoch: calendarLayoutEpoch,
  });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // After events finish loading, bump the layout epoch so the now-indicator
  // overlay recalculates its pixel positions against the rendered grid.
  useEffect(() => {
    if (!isLoading) {
      requestAnimationFrame(() => {
        setCalendarLayoutEpoch((n) => n + 1);
      });
    }
  }, [isLoading]);

  // Keep Friday grey bands aligned when the time grid scrolls or the window resizes.
  // Scroll uses one rAF-coalesced bump per frame. Viewport/calendar width changes are
  // throttled so resizing the window does not re-run overlay layout every frame.
  useEffect(() => {
    const wrap = calendarInteractRef.current;
    if (!wrap || isLoading) {
      return;
    }

    let scrollScheduled = 0;
    const scheduleLayoutBumpFromScroll = () => {
      if (scrollScheduled) {
        return;
      }
      scrollScheduled = requestAnimationFrame(() => {
        scrollScheduled = 0;
        setCalendarLayoutEpoch((n) => n + 1);
      });
    };

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastResizeBump = 0;
    const RESIZE_LAYOUT_MIN_MS = 48;

    const scheduleLayoutBumpFromResize = () => {
      const now = performance.now();
      if (now - lastResizeBump >= RESIZE_LAYOUT_MIN_MS) {
        lastResizeBump = now;
        if (resizeTimeout !== null) {
          clearTimeout(resizeTimeout);
          resizeTimeout = null;
        }
        setCalendarLayoutEpoch((n) => n + 1);
        return;
      }
      if (resizeTimeout !== null) {
        return;
      }
      const wait = RESIZE_LAYOUT_MIN_MS - (now - lastResizeBump);
      resizeTimeout = setTimeout(() => {
        resizeTimeout = null;
        lastResizeBump = performance.now();
        setCalendarLayoutEpoch((n) => n + 1);
      }, wait);
    };

    wrap.addEventListener("scroll", scheduleLayoutBumpFromScroll, true);
    window.addEventListener("scroll", scheduleLayoutBumpFromScroll, true);
    window.addEventListener("resize", scheduleLayoutBumpFromResize);

    const ro = new ResizeObserver(scheduleLayoutBumpFromResize);
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      wrap.removeEventListener("scroll", scheduleLayoutBumpFromScroll, true);
      window.removeEventListener("scroll", scheduleLayoutBumpFromScroll, true);
      window.removeEventListener("resize", scheduleLayoutBumpFromResize);
      if (scrollScheduled) {
        cancelAnimationFrame(scrollScheduled);
      }
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [isLoading]);

  // Friday afternoon restriction overlay — same positioning strategy as useNowIndicatorOverlay
  // (absolute inside wrap, not fixed viewport coords, so it stays aligned when the page or grid scrolls).
  useEffect(() => {
    if (isLoading) {
      setFridayJamOverlays([]);
      return;
    }

    const wrap = calendarInteractRef.current;
    const cal = calendarRef.current;
    if (!wrap || !cal) {
      return;
    }

    const slotMinMin = parseSlotTimeToMinutes(SLOT_MIN_STR);
    const slotMaxMin = parseSlotTimeToMinutes(SLOT_MAX_STR);

    let raf = 0;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const wrapEl = calendarInteractRef.current;
      const calInst = calendarRef.current;
      if (!wrapEl || !calInst) {
        return;
      }

      const wrapRect = wrapEl.getBoundingClientRect();
      const calApi = calInst.getApi();
      const cols = wrapEl.querySelectorAll(
        ".fc-timegrid-body .fc-timegrid-col:not(.fc-timegrid-axis)",
      );
      const next: FridayJamOverlayRect[] = [];

      const blockedEvents = events.filter(
        (ev) => ev.eventType === "blocked",
      );

      cols.forEach((node, i) => {
        const dayDate = dayDateForColumn(calApi, i);
        if (!isFridayLocalDay(dayDate)) {
          return;
        }

        const dateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;

        if (fridayExceptions.has(dateStr)) {
          return;
        }

        const fridayOverlayStartMs = new Date(dayDate);
        fridayOverlayStartMs.setHours(14, 30, 0, 0);

        const coveredByBlock = blockedEvents.some((ev) => {
          const evStart = new Date(ev.start);
          const evEnd = new Date(ev.end);
          return (
            sameLocalCalendarDay(evStart, dayDate) &&
            evStart.getTime() <= fridayOverlayStartMs.getTime() &&
            evEnd.getTime() >= fridayOverlayStartMs.getTime() + 30 * 60 * 1000
          );
        });

        if (coveredByBlock) {
          return;
        }

        const col = node as HTMLElement;
        const b = mirrorBoundsFromMinutesToGridBottom(
          col,
          wrapEl,
          FRIDAY_JAM_OVERLAY_START_MINUTES,
          slotMinMin,
          slotMaxMin,
        );
        if (b) {
          next.push({
            key: `fri-jam-${dayDate.getFullYear()}-${dayDate.getMonth() + 1}-${dayDate.getDate()}`,
            dateStr,
            top: Math.round(b.top - wrapRect.top + wrapEl.scrollTop),
            left: Math.round(b.left - wrapRect.left + wrapEl.scrollLeft),
            width: Math.round(b.width),
            height: Math.round(b.height),
          });
        }
      });

      setFridayJamOverlays(next);
    });

    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [
    isLoading,
    calendarLayoutEpoch,
    calendarTitle,
    isMobile,
    events,
    fridayExceptions,
  ]);

  // Re-render every 60 s (and on tab re-focus) so "past" event styling
  // updates as the current time crosses event end boundaries.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNowTick(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function goToPrev() {
    calendarRef.current?.getApi().prev();
  }

  function goToNext() {
    calendarRef.current?.getApi().next();
  }

  function goToToday() {
    calendarRef.current?.getApi().today();
  }

  const defaultFirstName = useMemo(() => {
    const raw = session?.user?.name?.trim();
    if (!raw) {
      return null;
    }
    const first = raw.split(/\s+/)[0]?.trim();
    return first || null;
  }, [session?.user?.name]);

  async function handleAdminBlockSubmit(values: { title: string }) {
    if (!adminBlockSelection) return;
    try {
      setIsBlockSubmitting(true);
      const response = await fetch("/api/blocked-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: adminBlockSelection.start.toISOString(),
          end: adminBlockSelection.end.toISOString(),
          title: values.title,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast(data.error || "Failed to create blocked time.", "error");
        return;
      }
      showToast("Time blocked off successfully.", "success");
      setAdminBlockSelection(null);
      clearDragMirror();
      await loadEvents();
    } catch {
      showToast("Failed to create blocked time.", "error");
    } finally {
      setIsBlockSubmitting(false);
    }
  }

  async function handleDeleteBlockedTime() {
    if (!blockedEventToDelete?.blockedTimeId) return;
    try {
      setIsBlockDeleting(true);
      const response = await fetch("/api/blocked-times", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockedTimeId: blockedEventToDelete.blockedTimeId,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast(data.error || "Failed to remove blocked time.", "error");
        return;
      }
      showToast("Blocked time removed.", "success");
      setBlockedEventToDelete(null);
      await loadEvents();
    } catch {
      showToast("Failed to remove blocked time.", "error");
    } finally {
      setIsBlockDeleting(false);
    }
  }

  async function handleOpenFriday() {
    if (!fridayToOpen) return;
    try {
      setIsFridayExceptionSubmitting(true);
      const response = await fetch("/api/friday-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: fridayToOpen }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast(
          data.error || "Failed to open this Friday.",
          "error",
        );
        return;
      }
      showToast("Friday restriction removed.", "success");
      setFridayToOpen(null);
      await loadEvents();
    } catch {
      showToast("Failed to open this Friday.", "error");
    } finally {
      setIsFridayExceptionSubmitting(false);
    }
  }

  const cancelTargetLabel = useMemo(
    () => getCalendarEventKindLabel(selectedEvent?.eventType),
    [selectedEvent?.eventType],
  );
  const cancelConfirmTitle = useMemo(() => {
    if (selectedEvent?.eventType === "practice") {
      return "Cancel practice booking?";
    }
    if (selectedEvent?.eventType === "jam") {
      return "Cancel jam reservation?";
    }
    return "Cancel event?";
  }, [selectedEvent?.eventType]);
  const cancelConfirmMessage = useMemo(
    () =>
      `This will remove the ${cancelTargetLabel} from the calendar. This cannot be reversed once done, and you will need to book a new session.`,
    [cancelTargetLabel],
  );
  const cancelConfirmLabel = useMemo(() => {
    if (selectedEvent?.eventType === "practice") {
      return "Cancel booking";
    }
    if (selectedEvent?.eventType === "jam") {
      return "Cancel reservation";
    }
    return "Remove event";
  }, [selectedEvent?.eventType]);

  const inDefaultIdleState =
    pendingSelection === null &&
    selectedEvent === null &&
    showCancelConfirm === false &&
    adminBlockSelection === null &&
    blockedEventToDelete === null &&
    fridayToOpen === null &&
    isLoading === false &&
    isDragInteracting === false;

  // Keyboard date-navigation: ArrowLeft/Right prev/next, T for today.
  // Only active on desktop when no modal is open and no drag in progress.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isMobile) {
        return;
      }
      if (!inDefaultIdleState) {
        return;
      }
      if (isTypingTarget(e.target)) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        goToToday();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inDefaultIdleState, isMobile]);

  // Escape key handler: closes the topmost open layer in priority order
  // (reserve modal > cancel confirmation > event details).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isMobile) {
        return;
      }
      if (isTypingTarget(e.target)) {
        return;
      }

      if (e.key !== "Escape") {
        return;
      }

      if (adminBlockSelection) {
        if (isBlockSubmitting) return;
        e.preventDefault();
        setAdminBlockSelection(null);
        clearDragMirror();
        return;
      }

      if (fridayToOpen) {
        if (isFridayExceptionSubmitting) return;
        e.preventDefault();
        setFridayToOpen(null);
        return;
      }

      if (blockedEventToDelete) {
        if (isBlockDeleting) return;
        e.preventDefault();
        setBlockedEventToDelete(null);
        return;
      }

      if (pendingSelection) {
        if (isSubmitting) {
          return;
        }
        e.preventDefault();
        void handleReserveModalClose();
        return;
      }

      if (showCancelConfirm) {
        e.preventDefault();
        setShowCancelConfirm(false);
        return;
      }

      if (selectedEvent) {
        e.preventDefault();
        setSelectedEvent(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isMobile,
    fridayToOpen,
    isFridayExceptionSubmitting,
    adminBlockSelection,
    isBlockSubmitting,
    blockedEventToDelete,
    isBlockDeleting,
    pendingSelection,
    isSubmitting,
    handleReserveModalClose,
    showCancelConfirm,
    selectedEvent,
    setSelectedEvent,
    setShowCancelConfirm,
  ]);

  // Mobile touch gestures: horizontal swipe for prev/next day,
  // double-tap for today. Ignored when modals are open or the target
  // is an interactive element (button, link, calendar event).
  useEffect(() => {
    const root = calendarInteractRef.current;
    if (!root) {
      return;
    }
    if (!isMobile) {
      return;
    }

    const SWIPE_MIN_PX = 50;
    const SWIPE_MAX_OFF_AXIS_PX = 80;
    const DOUBLE_TAP_MAX_MS = 320;
    const DOUBLE_TAP_MAX_PX = 24;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let swiping = false;
    let lastTapAt = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    function shouldIgnoreTarget(target: EventTarget | null) {
      const el = target instanceof HTMLElement ? target : null;
      if (!el) {
        return false;
      }
      return Boolean(
        el.closest("button,a,[role='button'],.fc-event,.fc-timegrid-event-harness"),
      );
    }

    function canNavigateByGesture() {
      return inDefaultIdleState;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        return;
      }
      if (!canNavigateByGesture()) {
        return;
      }
      if (shouldIgnoreTarget(e.target)) {
        return;
      }

      const t = e.touches.item(0);
      if (!t) {
        return;
      }
      tracking = true;
      swiping = false;
      startX = t.clientX;
      startY = t.clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking) {
        return;
      }
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches.item(0);
      if (!t) {
        return;
      }

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!swiping) {
        if (Math.abs(dx) < 10) {
          return;
        }
        // Only treat as swipe if it’s predominantly horizontal.
        if (Math.abs(dy) > SWIPE_MAX_OFF_AXIS_PX) {
          tracking = false;
          return;
        }
        if (Math.abs(dx) > Math.abs(dy) * 1.5) {
          swiping = true;
        } else {
          tracking = false;
          return;
        }
      }

      // Once we decide it’s a horizontal swipe, prevent scroll so it feels crisp.
      e.preventDefault();
    }

    function onTouchEnd(e: TouchEvent) {
      if (!tracking) {
        return;
      }
      tracking = false;

      const t = e.changedTouches.item(0);
      if (!t) {
        return;
      }

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (swiping && Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dy) <= SWIPE_MAX_OFF_AXIS_PX) {
        // Common mobile convention: swipe left -> next, swipe right -> prev.
        if (dx < 0) {
          goToNext();
        } else {
          goToPrev();
        }
        return;
      }

      // Not a swipe: treat as tap (for double-tap today).
      const now = Date.now();
      const dt = now - lastTapAt;
      const dist = Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY);
      if (dt <= DOUBLE_TAP_MAX_MS && dist <= DOUBLE_TAP_MAX_PX && canNavigateByGesture()) {
        lastTapAt = 0;
        goToToday();
        return;
      }
      lastTapAt = now;
      lastTapX = t.clientX;
      lastTapY = t.clientY;
    }

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
    };
  }, [inDefaultIdleState, isMobile]);

  function handleDatesSet(arg: DatesSetArg) {
    setCalendarTitle(arg.view.title);

    requestAnimationFrame(() => {
      const api = calendarRef.current?.getApi();
      const wrap = calendarInteractRef.current;
      if (!api || !wrap) {
        return;
      }

      const cols = wrap.querySelectorAll(
        ".fc-timegrid-body .fc-timegrid-col:not(.fc-timegrid-axis)",
      );
      cols.forEach((node, i) => {
        const dayDate = dayDateForColumn(api, i);
        node.classList.toggle("fc-past-day", isPastCalendarDay(dayDate));
      });
      setCalendarLayoutEpoch((n) => n + 1);
    });
  }

  function dayHeaderClassNames(arg: { date: Date }) {
    return isPastCalendarDay(arg.date) ? ["fc-past-day-header"] : [];
  }

  function eventClassNames(arg: EventContentArg) {
    const evType = arg.event.extendedProps.eventType;
    if (evType === "blocked") {
      return ["fc-blocked-event"];
    }
    const end = arg.event.end;
    if (!end) {
      return [];
    }
    return end.getTime() <= nowTick ? ["fc-event-past"] : [];
  }

  function renderEventContent(arg: EventContentArg) {
    const timeText = formatEventTimeRange(arg.event.start, arg.event.end);
    const eventType = arg.event.extendedProps.eventType as
      | "practice"
      | "jam"
      | "hold"
      | "blocked"
      | undefined;

    if (eventType === "hold") {
      return (
        <div className="fc-custom-event">
          <div className="fc-custom-event-time">{timeText}</div>
        </div>
      );
    }

    if (eventType === "blocked") {
      return (
        <div className="fc-custom-event flex h-full flex-col justify-start">
          <div className="fc-custom-event-title">
            {arg.event.title || "Practice Room Closed"}
          </div>
        </div>
      );
    }

    return (
      <div className="fc-custom-event">
        <div className="fc-custom-event-time">{timeText}</div>
        <div className="fc-custom-event-title">{arg.event.title}</div>
      </div>
    );
  }

  return (
    <>
      <section className="mb-5 rounded-3xl border border-white/10 bg-[#080808] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                The NEW Calendar...
              </h1>

              <div className="mt-3 max-w-2xl space-y-2 text-sm text-neutral-400 sm:text-base">
                <p>
                  - View booked practices by clicking on events (you can also
                  cancel YOUR bookings).
                </p>
                <p>
                  - Reserve time for a quick jam session by clicking and dragging
                  across a free timeslot.
                </p>
              </div>

              <p className="mt-3 max-w-2xl text-xs text-neutral-500 sm:text-sm">
                Note:{" "}
                <span className="font-semibold text-neutral-300">
                  Jam Sessions are different than normal practices
                </span>
                ...they are for personal practicing with the CSPR drumset or
                keyboard.
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 md:items-end">
              <div className="flex flex-wrap justify-center gap-5 border-t border-white/8 pt-4 text-sm text-neutral-300 md:justify-end md:border-0 md:pt-0">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-neutral-500" />
                  <span>Practice</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#3f56c9]" />
                  <span>Jam</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border border-dashed border-neutral-300 bg-white/20" />
                  <span>Temporary hold</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border border-dashed border-red-400/75 bg-[rgba(239,68,68,0.16)]" />
                  <span>Blocked</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/8 pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center justify-center gap-3 md:justify-start">
              <button
                type="button"
                onClick={goToPrev}
                className="rounded-xl bg-neutral-800 px-6 py-3 text-base font-medium text-white transition hover:bg-neutral-700 md:px-4 md:py-2 md:text-sm"
              >
                Prev
              </button>

              <button
                type="button"
                onClick={goToToday}
                className="rounded-xl bg-blue-500 px-6 py-3 text-base font-medium text-white transition hover:bg-blue-400 md:px-4 md:py-2 md:text-sm"
              >
                Today
              </button>

              <button
                type="button"
                onClick={goToNext}
                className="rounded-xl bg-neutral-800 px-6 py-3 text-base font-medium text-white transition hover:bg-neutral-700 md:px-4 md:py-2 md:text-sm"
              >
                Next
              </button>
            </div>

            <div className="hidden md:block md:text-right">
              <p className="text-sm text-neutral-500">
                {quarter?.name ?? "Room availability"}
              </p>
              <h2 className="text-2xl font-semibold text-white">
                {calendarTitle}
              </h2>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#080808] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        {isLoading ? (
          <p className="p-4 text-neutral-300">Loading calendar...</p>
        ) : (
          <div
            ref={calendarInteractRef}
            className="relative isolate [-webkit-tap-highlight-color:transparent] [touch-action:manipulation]"
          >
            <FullCalendar
              ref={calendarRef}
              key={calendarInstanceKey}
              plugins={[timeGridPlugin, interactionPlugin]}
              initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
              validRange={quarterValidRange}
              headerToolbar={false}
              stickyHeaderDates={false}
              height="auto"
              allDaySlot={false}
              nowIndicator
              nowIndicatorSnap={false}
              selectable={false}
              slotEventOverlap={false}
              editable={false}
              expandRows
              events={events}
              datesSet={handleDatesSet}
              dayHeaderClassNames={dayHeaderClassNames}
              eventClassNames={eventClassNames}
              eventContent={renderEventContent}
              slotMinTime={SLOT_MIN_STR}
              slotMaxTime={SLOT_MAX_STR}
              slotDuration="00:30:00"
              snapDuration="00:15:00"
              slotLabelInterval="00:30:00"
              slotLabelFormat={{
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              }}
              dayHeaderFormat={{
                weekday: "short",
                month: "numeric",
                day: "numeric",
              }}
              eventMinHeight={36}
              longPressDelay={150}
              eventClick={(info) => {
                const eventType = info.event.extendedProps.eventType as
                  | "practice"
                  | "jam"
                  | "hold"
                  | "blocked"
                  | undefined;

                if (eventType === "hold") {
                  showToast(
                    "This time is temporarily being reserved by another user.",
                    "info",
                  );
                  return;
                }

                if (eventType === "blocked") {
                  if (isAdmin) {
                    setBlockedEventToDelete({
                      id: info.event.id,
                      blockedTimeId:
                        info.event.extendedProps.blockedTimeId,
                      eventType,
                      title: info.event.title,
                      start:
                        info.event.start?.toISOString() ||
                        new Date().toISOString(),
                      end:
                        info.event.end?.toISOString() ||
                        new Date().toISOString(),
                    });
                  } else {
                    showToast(
                      "This time is blocked off.",
                      "info",
                    );
                  }
                  return;
                }

                setSelectedEvent({
                  id: info.event.id,
                  googleEventId: info.event.extendedProps.googleEventId,
                  holdId: info.event.extendedProps.holdId,
                  eventType,
                  title: info.event.title,
                  description: info.event.extendedProps.description,
                  attendees: info.event.extendedProps.attendees,
                  start:
                    info.event.start?.toISOString() || new Date().toISOString(),
                  end: info.event.end?.toISOString() || new Date().toISOString(),
                  color: info.event.backgroundColor,
                  textColor: info.event.textColor,
                  canCancel: info.event.extendedProps.canCancel,
                  classNames: info.event.classNames,
                });
              }}
            />

            {nowIndicatorOverlay ? (
              <NowIndicatorOverlayLayer o={nowIndicatorOverlay} />
            ) : null}

            {fridayJamOverlays.length > 0 ? (
              <div
                className="pointer-events-none absolute inset-0 z-[28]"
                aria-hidden
              >
                {fridayJamOverlays.map((o) => (
                  <div
                    key={o.key}
                    role={isAdmin ? "button" : undefined}
                    tabIndex={isAdmin ? 0 : undefined}
                    onClick={
                      isAdmin
                        ? () => setFridayToOpen(o.dateStr)
                        : undefined
                    }
                    onKeyDown={
                      isAdmin
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setFridayToOpen(o.dateStr);
                            }
                          }
                        : undefined
                    }
                    className={`absolute select-none overflow-hidden rounded-2xl border-2 border-dashed border-red-400/75 bg-[rgba(239,68,68,0.16)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-[6px] ${isAdmin ? "pointer-events-auto cursor-pointer outline-none" : ""}`}
                    style={{
                      top: o.top,
                      left: o.left,
                      width: o.width,
                      height: o.height,
                    }}
                  >
                    <div className="fc-custom-event flex h-full flex-col justify-start">
                      <div className="fc-custom-event-title">
                        Practice Room Closed
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {dragMirror ? (
              <div
                className={`pointer-events-none fixed z-[45] overflow-hidden rounded-2xl border-2 border-dashed shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-[6px] ${
                  isAdmin
                    ? "border-red-400/75 bg-[rgba(239,68,68,0.16)]"
                    : "border-[rgba(229,229,229,0.7)] bg-[rgba(255,255,255,0.14)]"
                }`}
                style={{
                  top: dragMirror.top,
                  left: dragMirror.left,
                  width: dragMirror.width,
                  height: dragMirror.height,
                }}
              >
                <div className="fc-custom-event h-full p-[11px_14px]">
                  <div className="fc-custom-event-time text-[0.86rem] font-medium leading-tight text-white/90">
                    {dragMirror.label}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <ReserveModal
        key={
          pendingSelection
            ? `${pendingSelection.start.getTime()}-${pendingSelection.end.getTime()}-${pendingSelection.requestId}`
            : "reserve-modal-idle"
        }
        isOpen={pendingSelection !== null}
        start={pendingSelection?.start ?? null}
        end={pendingSelection?.end ?? null}
        defaultName={defaultFirstName}
        isSubmitting={isSubmitting}
        expiresAt={pendingSelection?.expiresAt ?? null}
        mode={pendingSelection?.mode ?? "fallback"}
        onClose={handleReserveModalClose}
        onExpire={handleHoldExpire}
        onSubmit={handleReserve}
        dismissOnBackdrop={isMobile}
      />

      <BlockTimeModal
        isOpen={adminBlockSelection !== null}
        start={adminBlockSelection?.start ?? null}
        end={adminBlockSelection?.end ?? null}
        isSubmitting={isBlockSubmitting}
        onClose={() => { setAdminBlockSelection(null); clearDragMirror(); }}
        onSubmit={handleAdminBlockSubmit}
        dismissOnBackdrop={isMobile}
      />

      <ConfirmModal
        isOpen={blockedEventToDelete !== null}
        title="Remove blocked time?"
        message={
          blockedEventToDelete
            ? `This will remove the "${blockedEventToDelete.title}" block (${formatBookingDateRange(new Date(blockedEventToDelete.start), new Date(blockedEventToDelete.end))}) from both calendars, allowing users to book that time.`
            : ""
        }
        confirmLabel="Remove block"
        cancelLabel="Keep blocked"
        isLoading={isBlockDeleting}
        onCancel={() => setBlockedEventToDelete(null)}
        onConfirm={handleDeleteBlockedTime}
        dismissOnBackdrop={isMobile}
      />

      <ConfirmModal
        isOpen={fridayToOpen !== null}
        title="Open practice room this Friday?"
        message="This will remove the Friday afternoon restriction for this date, allowing users to book jam sessions past 2:30 PM."
        confirmLabel="Open Friday"
        cancelLabel="Keep closed"
        isLoading={isFridayExceptionSubmitting}
        onCancel={() => setFridayToOpen(null)}
        onConfirm={handleOpenFriday}
        dismissOnBackdrop={isMobile}
      />

      <EventDetailsModal
        isOpen={selectedEvent !== null}
        event={selectedEvent}
        isCancelling={isCancelling}
        onClose={() => setSelectedEvent(null)}
        onCancel={() => setShowCancelConfirm(true)}
        dismissOnBackdrop={isMobile}
      />

      <ConfirmModal
        isOpen={showCancelConfirm}
        title={cancelConfirmTitle}
        message={cancelConfirmMessage}
        confirmLabel={cancelConfirmLabel}
        cancelLabel="Keep session"
        isLoading={isCancelling}
        onCancel={() => setShowCancelConfirm(false)}
        onConfirm={confirmCancelReservation}
        dismissOnBackdrop={isMobile}
      />

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={closeToast}
      />
    </>
  );
}
