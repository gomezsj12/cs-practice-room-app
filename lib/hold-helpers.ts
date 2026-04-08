import type { CalendarEvent } from "@/lib/types";

export const OPTIMISTIC_HOLD_PREFIX = "optimistic-hold-";
const ACTIVE_HOLD_STORAGE_KEY = "practiceRoomJamActiveHoldId";

export function readActiveHoldId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return sessionStorage.getItem(ACTIVE_HOLD_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistActiveHoldId(holdId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(ACTIVE_HOLD_STORAGE_KEY, holdId);
  } catch {
    /* private mode or storage quota */
  }
}

export function clearActiveHoldId() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.removeItem(ACTIVE_HOLD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function stripOptimisticHoldEvents(
  events: CalendarEvent[],
): CalendarEvent[] {
  return events.filter(
    (e) =>
      !e.id.startsWith(OPTIMISTIC_HOLD_PREFIX) &&
      !e.holdId?.startsWith(OPTIMISTIC_HOLD_PREFIX),
  );
}

export function makeOptimisticHoldEvent(
  start: Date,
  end: Date,
): CalendarEvent {
  const id = `${OPTIMISTIC_HOLD_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    holdId: id,
    eventType: "hold",
    title: "Pending hold",
    start: start.toISOString(),
    end: end.toISOString(),
    color: "rgba(255, 255, 255, 0.14)",
    textColor: "#f5f5f5",
    canCancel: false,
    classNames: ["pending-hold-event"],
  };
}
