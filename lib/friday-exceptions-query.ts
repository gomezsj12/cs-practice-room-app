/**
 * Server-side lookup for Supabase `friday_exceptions` aligned with room-local calendar.
 */

import {
  getZonedCalendarParts,
  shortWeekdayInZone,
} from "@/lib/calendar-helpers";
import { getSupabaseAdmin } from "@/lib/supabase";

function roomTimeZone(): string {
  return (
    (typeof process !== "undefined" && process.env.ROOM_TIME_ZONE) ||
    "America/Los_Angeles"
  );
}

/**
 * Returns true when `startIso` falls on a Friday in the room time zone **and**
 * that room-local date has a row in `friday_exceptions` (jams allowed past 2:30 PM).
 */
export async function roomLocalFridayHasException(
  startIso: string,
): Promise<boolean> {
  const requestStart = new Date(startIso);
  if (Number.isNaN(requestStart.getTime())) {
    return false;
  }

  const tz = roomTimeZone();
  if (shortWeekdayInZone(requestStart, tz) !== "Fri") {
    return false;
  }

  const z = getZonedCalendarParts(requestStart, tz);
  const dateStr = `${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("friday_exceptions")
      .select("exception_date")
      .eq("exception_date", dateStr)
      .maybeSingle();

    if (error) {
      console.error("[friday-exceptions-query] Supabase lookup failed:", error);
      return false;
    }

    return data != null;
  } catch (e) {
    console.error("[friday-exceptions-query] Exception:", e);
    return false;
  }
}
