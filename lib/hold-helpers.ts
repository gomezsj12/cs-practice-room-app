/**
 * Client-side helpers for the hold-based booking flow.
 *
 * A "hold" is a short-lived server reservation that secures a time slot
 * while the user fills in the booking form. This module manages:
 *
 * - **Session storage** of the active hold ID (survives page refreshes).
 * - **Optimistic UI events** injected into the calendar while the hold
 *   request is in-flight (before the server responds).
 *
 * @see {@link ../lib/types.ts}: `CalendarEvent` shape.
 * @see {@link ../lib/calendar-helpers.ts}: server-side booking validation.
 */
import type { CalendarEvent } from "@/lib/types";

/**
 * ID prefix for optimistic (client-generated) hold events.
 * Events with this prefix are replaced once the server confirms the hold.
 */
export const OPTIMISTIC_HOLD_PREFIX = "optimistic-hold-";

/** SessionStorage key for persisting the active hold ID across navigations. */
const ACTIVE_HOLD_STORAGE_KEY = "practiceRoomJamActiveHoldId";

/**
 * Read the currently active hold ID from session storage.
 * Returns `null` on the server or when storage is inaccessible.
 */
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

/**
 * Store a hold ID in session storage so it survives soft navigations.
 * Silently no-ops on the server or in private-browsing mode.
 */
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

/** Remove the active hold ID from session storage (hold released or expired). */
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

/**
 * Remove all optimistic hold events from an event array.
 * Called after the server responds so the real event replaces the placeholder.
 */
export function stripOptimisticHoldEvents(
  events: CalendarEvent[],
): CalendarEvent[] {
  return events.filter(
    (e) =>
      !e.id.startsWith(OPTIMISTIC_HOLD_PREFIX) &&
      !e.holdId?.startsWith(OPTIMISTIC_HOLD_PREFIX),
  );
}

/**
 * Build a temporary calendar event representing an in-flight hold request.
 *
 * The ID includes a timestamp + random suffix so each optimistic event is
 * unique even if the user creates multiple holds within the same millisecond.
 *
 * @param start - Slot start (local Date).
 * @param end   - Slot end (local Date).
 */
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
