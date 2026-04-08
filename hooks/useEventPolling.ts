import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent, PendingSelection } from "@/lib/types";

const REFETCH_COOLDOWN_MS = 5000;

export function useEventPolling(
  showToast: (message: string, type: "success" | "error" | "info") => void,
  status: "loading" | "authenticated" | "unauthenticated",
  pendingSelectionRef: React.RefObject<PendingSelection | null>,
) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const eventsRef = useRef<CalendarEvent[]>([]);
  const lastFetchAtRef = useRef(0);

  eventsRef.current = events;

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

        setEvents(data);
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
  }, [status, loadEvents]);

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

  return { events, setEvents, isLoading, loadEvents, eventsRef };
}
