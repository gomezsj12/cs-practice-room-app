import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent, PendingSelection } from "@/lib/types";
import {
  OPTIMISTIC_HOLD_PREFIX,
  clearActiveHoldId,
  persistActiveHoldId,
  readActiveHoldId,
  stripOptimisticHoldEvents,
} from "@/lib/hold-helpers";

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

  const holdRequestIdRef = useRef(0);
  const activeServerHoldIdRef = useRef<string | null>(null);
  const createHoldOrFallbackRef = useRef<
    (start: Date, end: Date) => Promise<void>
  >(async () => {});

  (pendingSelectionRef as React.MutableRefObject<PendingSelection | null>).current = pendingSelection;

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

  useEffect(() => {
    const id = pendingSelection?.holdId;
    activeServerHoldIdRef.current =
      id && !id.startsWith(OPTIMISTIC_HOLD_PREFIX) ? id : null;
  }, [pendingSelection]);

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

  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
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

  async function createHoldOrFallback(start: Date, end: Date) {
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

      if (response.status === 409) {
        setEvents((prev) => stripOptimisticHoldEvents(prev));
        setPendingSelection(null);
        showToast(data.error || "That time is not available.", "error");
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

  async function cleanupPendingSelection() {
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

  async function confirmCancelReservation() {
    if (
      !selectedEvent ||
      selectedEvent.eventType !== "jam" ||
      !selectedEvent.googleEventId
    ) {
      return;
    }

    const cancelEnd = new Date(selectedEvent.end);
    if (
      !Number.isNaN(cancelEnd.getTime()) &&
      Date.now() >= cancelEnd.getTime()
    ) {
      setShowCancelConfirm(false);
      showToast(
        "This reservation has already ended and can\u2019t be cancelled.",
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
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel reservation.");
      }

      setEvents((currentEvents) =>
        currentEvents.filter(
          (event) => event.googleEventId !== selectedEvent.googleEventId,
        ),
      );

      setSelectedEvent(null);
      setShowCancelConfirm(false);
      showToast("Jam reservation cancelled.", "success");
      loadEvents(true);
    } catch (error) {
      console.error(error);

      if (error instanceof Error) {
        showToast(error.message, "error");
      } else {
        showToast("Could not cancel reservation.", "error");
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
