/**
 * Resolves the calendar data window from `wwu_quarters` (Supabase) using
 * “today” in {@link getRoomTimeZone}. Falls back to rolling −7/+30 days when
 * no row matches or Supabase errors.
 */
import { fromZonedTime } from "date-fns-tz";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { ApiQuarterInfo } from "@/lib/types";

export function getRoomTimeZone(): string {
  return process.env.ROOM_TIME_ZONE?.trim() || "America/Los_Angeles";
}

/** `YYYY-MM-DD` for the given instant in `timeZone`. */
export function calendarDateInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function ymdBoundsToUtcDates(
  startDate: string,
  endDate: string,
  timeZone: string,
): { timeMin: Date; timeMax: Date } {
  const timeMin = fromZonedTime(`${startDate}T00:00:00`, timeZone);
  const timeMax = fromZonedTime(`${endDate}T23:59:59.999`, timeZone);
  return { timeMin, timeMax };
}

/** Same rolling window as the pre-quarter `GET /api/events` behaviour. */
export function rollingFallbackWindow(now: Date = new Date()): {
  timeMin: Date;
  timeMax: Date;
} {
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 7);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 30);
  return { timeMin, timeMax };
}

export type ActiveQuarterResult = {
  quarter: ApiQuarterInfo;
  timeMin: Date;
  timeMax: Date;
};

/**
 * Returns the quarter where `start_date ≤ today ≤ end_date` (date-only, room TZ),
 * preferring the latest `start_date` if multiple rows match.
 */
export async function getActiveQuarterWindow(): Promise<ActiveQuarterResult | null> {
  const tz = getRoomTimeZone();
  const todayStr = calendarDateInZone(new Date(), tz);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("wwu_quarters")
      .select("name, start_date, end_date")
      .lte("start_date", todayStr)
      .gte("end_date", todayStr)
      .order("start_date", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[quarter-window] Supabase query failed:", error);
      return null;
    }

    const row = data?.[0];
    if (!row) {
      return null;
    }

    const { timeMin, timeMax } = ymdBoundsToUtcDates(
      row.start_date,
      row.end_date,
      tz,
    );

    return {
      quarter: {
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
      },
      timeMin,
      timeMax,
    };
  } catch (e) {
    console.error("[quarter-window] Unexpected error:", e);
    return null;
  }
}
