/**
 * @file Booking flow orchestrator — hold lifecycle, reservation, and cancellation.
 *
 * ## Hold lifecycle
 *
 * When the user completes a drag-select, the flow moves through up to three
 * modes stored in `pendingSelection.mode`:
 *
 * 1. **`"securing"`** – A server-side hold is being created. The UI shows a
 *    loading state; no countdown is running yet.
 * 2. **`"hold"`** – The server returned a confirmed hold with `holdId` and
 *    `expiresAt`. A countdown timer runs in the reservation modal. If the
 *    timer reaches zero, `handleHoldExpire` cleans up.
 * 3. **`"fallback"`** – The hold endpoint failed or returned a non-409 error.
 *    The modal still opens, but without a server-side hold — the reservation
 *    will be attempted directly, accepting a small race window.
 *
 * ## Stale-request guard
 *
 * `holdRequestIdRef` is an incrementing counter. Each call to
 * `createHoldOrFallback` captures its own `requestId`; when the response
 * arrives, it compares against the ref's *current* value. If they differ, a
 * newer drag-select superseded this one and the late response is discarded
 * (and its server hold released immediately).
 *
 * ## Orphan cleanup
 *
 * - **On mount**: `readActiveHoldId()` checks `sessionStorage` for a hold id
 *   persisted by a previous page load that was never released (e.g. the tab
 *   crashed). If found, it is released and the events are refreshed.
 * - **On `pagehide`**: If a server hold is active when the page is unloading,
 *   a `keepalive` fetch fires to release it. `event.persisted` (bfcache) is
 *   skipped because the page will be restored with its JS state intact.
 *
 * @see {@link useDragSelect} which calls `createHoldOrFallbackRef` to enter
 *      the booking flow after a successful drag-select.
 * @see `lib/hold-helpers` for `sessionStorage` persistence and optimistic
 *      hold event utilities.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getCalendarEventKindLabel } from "@/lib/calendar-events";
import type { CalendarEvent, PendingSelection } from "@/lib/types";
import {
  OPTIMISTIC_HOLD_PREFIX,
  clearActiveHoldId,
  persistActiveHoldId,
  readActiveHoldId,
  stripOptimisticHoldEvents,
} from "@/lib/hold-helpers";

/**
 * Orchestrates the full booking flow: hold creation, reservation submission,
 * hold expiry, modal close cleanup, and reservation cancellation.
 *
 * @param showToast           - Toast display callback.
 * @param loadEvents          - Imperative event refetch from {@link useEventPolling}.
 * @param setEvents           - State setter for optimistic UI updates.
 * @param status              - NextAuth session status.
 * @param pendingSelectionRef - Shared ref kept in sync with `pendingSelection` state
 *                              so other hooks can read it without re-rendering.
 */
export function useBookingFlow(
  showToast: (message: string, type: "success" | "error" | "info") => void,
  loadEvents: (silent?: boolean) => Promise<void>,
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>,
  status: "loading" | "authenticated" | "unauthenticated",
  pendingSelectionRef: React.RefObject<PendingSelection | null>,
) {
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  /** Monotonically increasing counter to detect stale hold responses.
   *  @see file-level JSDoc "Stale-request guard" section. */
  const holdRequestIdRef = useRef(0);
  /** Tracks the *confirmed* server hold id (excludes optimistic/fallback).
   *  Read by the `pagehide` listener for last-resort cleanup. */
  const activeServerHoldIdRef = useRef<string | null>(null);
  /** Stable ref so drag-select can call the latest closure without
   *  being listed in the effect's dependency array. */
  const createHoldOrFallbackRef = useRef<
    (start: Date, end: Date) => Promise<void>
  >(async () => {});

  // Mirror state into the shared ref so useEventPolling and useDragSelect
  // can read the latest pendingSelection without subscribing to state changes.
  (pendingSelectionRef as React.MutableRefObject<PendingSelection | null>).current = pendingSelection;

  /** Fire-and-forget server hold release. Errors are logged, not surfaced. */
  const releaseHold = useCallback(async (holdId: string) => {
    try {
      await fetch("/api/holds/release", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ holdId }),
      });
    } catch (error) {
      console.error("Failed to release hold:", error);
    }
  }, []);

  // Keep activeServerHoldIdRef up-to-date; optimistic-prefix ids are
  // client-only placeholders and excluded from cleanup logic.
  useEffect(() => {
    const id = pendingSelection?.holdId;
    activeServerHoldIdRef.current =
      id && !id.startsWith(OPTIMISTIC_HOLD_PREFIX) ? id : null;
  }, [pendingSelection]);

  // Orphan cleanup on mount: release a hold that was persisted to
  // sessionStorage by a previous page load but never properly released
  // (e.g. tab crash, navigation away before cleanup ran).
  useEffect(() => {
    const orphan = readActiveHoldId();
    if (!orphan) {
      return;
    }

    clearActiveHoldId();

    void (async () => {
      try {
        await fetch("/api/holds/release", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ holdId: orphan }),
        });
      } catch (error) {
        console.error("Failed to release orphaned hold on load:", error);
      }

      await loadEvents(true);
    })();
  }, [loadEvents]);

  // Last-resort cleanup: if the page is truly unloading (not bfcache),
  // fire a keepalive release for any active server hold.
  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      // bfcache pages are restored with JS state intact — skip release.
      if (event.persisted) {
        return;
      }

      const holdId = activeServerHoldIdRef.current;
      if (!holdId) {
        return;
      }

      clearActiveHoldId();

      fetch("/api/holds/release", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({ holdId }),
      }).catch((error) => {
        console.error("Failed to release hold on page hide:", error);
      });
    };

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  function removeHoldFromUi(holdId?: string) {
    if (!holdId) {
      return;
    }

    setEvents((currentEvents) =>
      currentEvents.filter((event) => event.holdId !== holdId),
    );
  }

  /**
   * Attempt to secure a server-side hold for the selected time range.
   *
   * Transitions through `securing → hold` on success, `securing → fallback`
   * on non-conflict failure, and aborts with a toast on 409 (conflict).
   * Late responses from superseded requests are detected via
   * `holdRequestIdRef` and silently discarded after releasing the orphaned
   * server hold.
   */
  async function createHoldOrFallback(start: Date, end: Date) {
    // Increment the request counter *before* the await so any concurrent
    // call will see a newer id and the current one becomes stale.
    const requestId = ++holdRequestIdRef.current;

    setPendingSelection({
      start,
      end,
      mode: "securing",
      requestId,
    });

    try {
      const response = await fetch("/api/holds/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      const data = await response.json();

      // Stale check: a newer drag-select has already started — discard this
      // response and release the server hold it created.
      const isStale = holdRequestIdRef.current !== requestId;

      if (response.ok) {
        if (isStale) {
          if (data.holdId) {
            await releaseHold(data.holdId);
            if (readActiveHoldId() === data.holdId) {
              clearActiveHoldId();
            }
          }
          return;
        }

        persistActiveHoldId(data.holdId);

        setPendingSelection({
          start: new Date(data.start),
          end: new Date(data.end),
          holdId: data.holdId,
          expiresAt: data.expiresAt,
          mode: "hold",
          requestId,
        });

        void loadEvents(true);
        return;
      }

      if (isStale) {
        return;
      }

      // 409 = another reservation already occupies this slot.
      if (response.status === 409) {
        setEvents((prev) => stripOptimisticHoldEvents(prev));
        setPendingSelection(null);
        showToast(data.error || "That time is not available.", "error");
        return;
      }

      // Non-conflict server error → degrade gracefully to fallback mode
      // so the user can still attempt a direct reservation.
      showToast(
        "Temporary hold unavailable. Continuing with standard booking flow.",
        "info",
      );

      setPendingSelection({
        start,
        end,
        mode: "fallback",
        requestId,
      });
    } catch (error) {
      console.error("Hold creation failed:", error);

      if (holdRequestIdRef.current !== requestId) {
        return;
      }

      showToast(
        "Temporary hold unavailable. Continuing with standard booking flow.",
        "info",
      );

      setPendingSelection({
        start,
        end,
        mode: "fallback",
        requestId,
      });
    }
  }

  createHoldOrFallbackRef.current = createHoldOrFallback;

  /**
   * Submit the reservation to `/api/reserve`.
   *
   * On success the optimistic hold event is swapped for the real event
   * returned by the server, and a background refetch ensures full
   * consistency with Google Calendar.
   */
  async function handleReserve(values: {
    name: string;
    instrument: string;
  }) {
    if (status !== "authenticated") {
      return;
    }

    if (!pendingSelection) {
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch("/api/reserve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: values.name,
          instrument: values.instrument,
          start: pendingSelection.start.toISOString(),
          end: pendingSelection.end.toISOString(),
          holdId: pendingSelection.holdId ?? null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create reservation.");
      }

      const holdId = pendingSelection.holdId;

      removeHoldFromUi(holdId);
      setEvents((currentEvents) => [
        ...stripOptimisticHoldEvents(currentEvents),
        data,
      ]);
      setPendingSelection(null);
      clearActiveHoldId();
      showToast("Jam reservation created.", "success");
      await loadEvents(true);
    } catch (error) {
      console.error(error);

      if (error instanceof Error) {
        showToast(error.message, "error");
      } else {
        showToast("Could not create reservation.", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Tear down the current pending selection: bump the stale-request counter
   * to invalidate any in-flight hold requests, remove optimistic UI events,
   * release the server hold if one exists, and refresh the event list.
   */
  async function cleanupPendingSelection() {
    // Bump to invalidate any in-flight createHoldOrFallback responses.
    holdRequestIdRef.current += 1;

    const holdId = pendingSelection?.holdId;

    setEvents((prev) => stripOptimisticHoldEvents(prev));
    removeHoldFromUi(holdId);
    setPendingSelection(null);

    if (holdId && !holdId.startsWith(OPTIMISTIC_HOLD_PREFIX)) {
      await releaseHold(holdId);
      clearActiveHoldId();
      await loadEvents(true);
    } else {
      clearActiveHoldId();
    }
  }

  async function handleReserveModalClose() {
    await cleanupPendingSelection();
  }

  async function handleHoldExpire() {
    await cleanupPendingSelection();
    showToast("Your temporary hold expired.", "info");
  }

  /**
   * Delete an existing jam reservation or practice booking via `/api/cancel`.
   *
   * Guards against cancelling unsupported events and events that have already
   * ended (server would reject anyway, but a client-side check gives a
   * friendlier message).
   */
  async function confirmCancelReservation() {
    if (
      !selectedEvent ||
      (selectedEvent.eventType !== "jam" &&
        selectedEvent.eventType !== "practice") ||
      !selectedEvent.googleEventId
    ) {
      return;
    }

    const eventKindLabel = getCalendarEventKindLabel(selectedEvent.eventType);

    // Client-side end-time guard — prevents a wasted round-trip.
    const cancelEnd = new Date(selectedEvent.end);
    if (
      !Number.isNaN(cancelEnd.getTime()) &&
      Date.now() >= cancelEnd.getTime()
    ) {
      setShowCancelConfirm(false);
      showToast(
        `This ${eventKindLabel} has already ended and can\u2019t be cancelled.`,
        "info",
      );
      return;
    }

    try {
      setIsCancelling(true);

      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          googleEventId: selectedEvent.googleEventId,
          eventType: selectedEvent.eventType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel booking.");
      }

      setEvents((currentEvents) =>
        currentEvents.filter(
          (event) => event.googleEventId !== selectedEvent.googleEventId,
        ),
      );

      setSelectedEvent(null);
      setShowCancelConfirm(false);
      showToast(
        selectedEvent.eventType === "practice"
          ? "Practice booking cancelled."
          : "Jam reservation cancelled.",
        "success",
      );
      loadEvents(true);
    } catch (error) {
      console.error(error);

      if (error instanceof Error) {
        showToast(error.message, "error");
      } else {
        showToast("Could not cancel booking.", "error");
      }
    } finally {
      setIsCancelling(false);
    }
  }

  return {
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
  };
}
