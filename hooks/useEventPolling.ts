/**
 * @file Calendar event polling and cache-freshness hook.
 *
 * Keeps the local `events` array in sync with the server through three
 * complementary strategies:
 *
 * 1. **30 s interval** – silent background refetch while the tab is visible
 *    and no booking flow is in progress.
 * 2. **Window focus / visibility-change** – refetches when the user returns
 *    to the tab, subject to a cooldown to avoid duplicate requests.
 * 3. **Imperative `loadEvents`** – called directly by other hooks (e.g.
 *    after a reservation is created or a hold is released).
 *
 * Refetches are suppressed while `pendingSelectionRef` is set to avoid
 * overwriting the optimistic hold event the user is currently interacting
 * with.
 *
 * @see {@link useBookingFlow} which calls `loadEvents` after reserve/cancel.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent, PendingSelection } from "@/lib/types";

/** Minimum ms between consecutive silent refetches triggered by focus/visibility. */
const REFETCH_COOLDOWN_MS = 5000;

/**
 * Fetches calendar events from `/api/events` and keeps them fresh via
 * polling, focus-refetch, and visibility-change refetch.
 *
 * @param showToast   - Display an error toast on non-silent fetch failures.
 * @param status      - NextAuth session status; triggers an initial fetch on change.
 * @param pendingSelectionRef - When non-null, background refetches are suppressed
 *                              to protect the in-progress booking flow's optimistic UI.
 * @param profileRefreshKey   - When this value changes (e.g. session `profileUpdatedAt`),
 *                              events are refetched so admin-only affordances stay correct.
 * @returns `events` state, `setEvents` setter (for optimistic updates),
 *          `isLoading`, `loadEvents` imperative refetch, a stable
 *          `eventsRef` for read-without-rerender access, and
 *          `fridayExceptions` / `fridayExceptionsRef` — the set of
 *          YYYY-MM-DD date strings for Fridays whose afternoon
 *          restriction has been lifted by an admin.
 */
export function useEventPolling(
  showToast: (message: string, type: "success" | "error" | "info") => void,
  status: "loading" | "authenticated" | "unauthenticated",
  pendingSelectionRef: React.RefObject<PendingSelection | null>,
  profileRefreshKey?: string | null,
) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [fridayExceptions, setFridayExceptions] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  /** Stable ref mirrored from `events` state — lets drag-select read the
   *  latest events inside imperative event handlers without re-subscribing. */
  const eventsRef = useRef<CalendarEvent[]>([]);
  const fridayExceptionsRef = useRef<Set<string>>(new Set());
  const lastFetchAtRef = useRef(0);

  eventsRef.current = events;
  fridayExceptionsRef.current = fridayExceptions;

  const loadEvents = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setIsLoading(true);
        }

        const response = await fetch("/api/events", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load events.");
        }

        if (Array.isArray(data)) {
          setEvents(data);
        } else {
          setEvents(data.events ?? []);
          setFridayExceptions(
            new Set<string>(data.fridayExceptions ?? []),
          );
        }
        lastFetchAtRef.current = Date.now();
      } catch (error) {
        console.error(error);

        if (!silent) {
          showToast("Could not load Google Calendar events.", "error");
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [showToast],
  );

  useEffect(() => {
    loadEvents();
  }, [status, loadEvents, profileRefreshKey]);

  // Background polling — 30 s cadence, skipped when tab is hidden or a
  // booking flow is active to avoid clobbering optimistic hold events.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !pendingSelectionRef.current
      ) {
        loadEvents(true);
      }
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadEvents, pendingSelectionRef]);

  // Refetch on window focus and tab visibility change, throttled by
  // REFETCH_COOLDOWN_MS to avoid duplicate requests when both fire in quick
  // succession (common on some browsers).
  useEffect(() => {
    const handleFocus = () => {
      if (
        !pendingSelectionRef.current &&
        Date.now() - lastFetchAtRef.current >= REFETCH_COOLDOWN_MS
      ) {
        loadEvents(true);
      }
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        !pendingSelectionRef.current &&
        Date.now() - lastFetchAtRef.current >= REFETCH_COOLDOWN_MS
      ) {
        loadEvents(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [loadEvents, pendingSelectionRef]);

  return {
    events,
    setEvents,
    isLoading,
    loadEvents,
    eventsRef,
    fridayExceptions,
    fridayExceptionsRef,
  };
}
