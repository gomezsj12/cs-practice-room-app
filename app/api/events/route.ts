/**
 * @file Calendar events API route (`GET /api/events`).
 *
 * Merges data sources into a unified response for the calendar UI:
 * 1. **Practice bookings** — events from the practice Google Calendar with
 *    cleaned description text and owner-only cancellation eligibility.
 * 2. **Jam reservations** — events from the jam Google Calendar (cancellable by owner/admin).
 * 3. **Temporary holds** — pending rows from Supabase `reservation_holds`
 *    (only when `ENABLE_TEMP_HOLDS=true`).
 * 4. **Blocked times** — admin-created blocked periods from Supabase
 *    `blocked_times`, rendered as red overlay events.
 * 5. **Friday exceptions** — dates from Supabase `friday_exceptions` where
 *    the hard-coded Friday afternoon restriction is lifted.
 *
 * Returns `{ events, fridayExceptions, quarter? }`. When a Supabase quarter
 * contains “today” (room timezone), `quarter` carries its name and bounds and
 * Google/Supabase queries use that window; otherwise the rolling −7/+30 day
 * fallback is used and `quarter` is `null`.
 *
 * All queries run in parallel via `Promise.all` to minimise latency.
 * Google Calendar and Supabase failures are handled independently so a
 * Supabase outage doesn't block calendar display.
 *
 * @see {@link @/lib/google} — Google Calendar service-account client
 * @see {@link @/lib/supabase} — Supabase admin client
 * @see {@link @/lib/types} — `ApiCalendarEvent`, `GoogleApiEvent`, `HoldRow`
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import {
  canUserCancelJamEvent,
  canUserCancelPracticeEvent,
  cleanCalendarEventDescription,
  sanitizeCalendarEventAttendees,
} from "@/lib/calendar-events";
import { getCalendarClient } from "@/lib/google";
import { getProfileByGoogleEmail } from "@/lib/profile-helpers";
import {
  getActiveQuarterWindow,
  rollingFallbackWindow,
} from "@/lib/quarter-window";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  ApiCalendarEvent,
  ApiQuarterInfo,
  BlockedTimeRow,
  GoogleApiEvent,
  HoldRow,
} from "@/lib/types";

/** Type-guard that narrows `T | null` to `T`. */
function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

/**
 * Converts a raw Google Calendar event into the normalised `ApiCalendarEvent`
 * shape consumed by the front-end calendar.
 *
 * Returns `null` for events missing a required field (id, start, end) so
 * callers can filter them out safely.
 *
 * @param event - Raw event from the Google Calendar API.
 * @param eventType - `"practice"` or `"jam"` — determines colour and cancel eligibility.
 * @param context - Signed-in user information used to compute cancel permissions.
 */
function mapGoogleEventToApiEvent(
  event: GoogleApiEvent,
  eventType: "practice" | "jam",
  context: {
    currentUserEmail?: string;
    currentUserWwuEmail?: string;
    currentUserNames?: string[];
    adminEmail?: string;
    isAdmin?: boolean;
  } = {},
): ApiCalendarEvent | null {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;

  if (!event.id || !start || !end) {
    return null;
  }

  const attendees = sanitizeCalendarEventAttendees(event.attendees);
  const canCancel =
    eventType === "jam"
      ? canUserCancelJamEvent(
          event,
          context.currentUserEmail,
          context.adminEmail,
          context.isAdmin,
        )
      : canUserCancelPracticeEvent(
          event,
          context.currentUserWwuEmail,
          context.currentUserNames,
          context.isAdmin,
        );

  return {
    id: `${eventType}-${event.id}`,
    googleEventId: event.id,
    eventType,
    title:
      event.summary ||
      (eventType === "practice" ? "Practice booking" : "Jam hold"),
    description: cleanCalendarEventDescription(event.description),
    attendees,
    start,
    end,
    color: eventType === "practice" ? "#767676" : "#3f56c9",
    textColor: "#ffffff",
    canCancel,
  };
}

/** Converts a Supabase hold row into a ghost-styled `ApiCalendarEvent`. */
function mapHoldToApiEvent(row: HoldRow): ApiCalendarEvent {
  return {
    id: `hold-${row.id}`,
    holdId: row.id,
    eventType: "hold",
    title: "Pending hold",
    start: row.start_at,
    end: row.end_at,
    color: "rgba(255, 255, 255, 0.14)",
    textColor: "#f5f5f5",
    canCancel: false,
    classNames: ["pending-hold-event"],
  };
}

/** Converts a Supabase blocked-time row into a red-overlay `ApiCalendarEvent`. */
function mapBlockedTimeToApiEvent(
  row: BlockedTimeRow,
  isAdmin: boolean,
): ApiCalendarEvent {
  return {
    id: `blocked-${row.id}`,
    blockedTimeId: row.id,
    eventType: "blocked",
    title: row.title || "Practice Room Closed",
    start: row.start_time,
    end: row.end_time,
    color: "rgba(239,68,68,0.16)",
    textColor: "#ffffff",
    canCancel: isAdmin,
  };
}

/**
 * Handles `GET /api/events`.
 *
 * Fetches practice events, jam events, pending holds, and blocked times
 * in parallel, maps them into a unified `ApiCalendarEvent[]`, and returns
 * the merged list. The window is the active WWU quarter when configured,
 * else `now − 7 days` → `now + 30 days`.
 */
export async function GET() {
  try {
    const session = await auth();
    const currentUserEmail = session?.user?.email || undefined;
    const currentUserName = session?.user?.name || undefined;
    const adminEmail = process.env.ADMIN_EMAIL;

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    const jamCalendarId = process.env.JAM_CALENDAR_ID;

    if (!practiceCalendarId || !jamCalendarId) {
      return NextResponse.json(
        { error: "Missing calendar IDs in environment variables." },
        { status: 500 },
      );
    }

    const calendar = getCalendarClient();
    const currentUserProfilePromise = currentUserEmail
      ? getProfileByGoogleEmail(currentUserEmail).catch((error) => {
          console.error("[events] Failed to load current user profile:", error);
          return null;
        })
      : Promise.resolve(null);

    const activeQuarter = await getActiveQuarterWindow();
    let quarter: ApiQuarterInfo | null = null;
    let timeMin: Date;
    let timeMax: Date;

    if (activeQuarter) {
      quarter = activeQuarter.quarter;
      timeMin = activeQuarter.timeMin;
      timeMax = activeQuarter.timeMax;
    } else {
      const fb = rollingFallbackWindow();
      timeMin = fb.timeMin;
      timeMax = fb.timeMax;
    }

    const holdsEnabled = process.env.ENABLE_TEMP_HOLDS === "true";
    const holdQueryPromise = holdsEnabled
      ? (async () => {
          try {
            const supabase = getSupabaseAdmin();
            const nowIso = new Date().toISOString();
            const { data, error } = await supabase
              .from("reservation_holds")
              .select(
                "id, start_at, end_at, expires_at, owner_email, owner_name, status",
              )
              .eq("status", "pending")
              .gt("expires_at", nowIso)
              .order("start_at", { ascending: true });
            if (error) {
              throw error;
            }
            return (data ?? []).map((row) => mapHoldToApiEvent(row as HoldRow));
          } catch (holdError) {
            console.error("Supabase hold loading failed:", holdError);
            return [] as ApiCalendarEvent[];
          }
        })()
      : Promise.resolve([] as ApiCalendarEvent[]);

    const fridayExceptionsPromise = (async () => {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from("friday_exceptions")
          .select("exception_date")
          .gte("exception_date", timeMin.toISOString().slice(0, 10))
          .lte("exception_date", timeMax.toISOString().slice(0, 10));
        if (error) {
          throw error;
        }
        return (data ?? []).map(
          (row: { exception_date: string }) => row.exception_date,
        );
      } catch (err) {
        console.error("Supabase friday_exceptions loading failed:", err);
        return [] as string[];
      }
    })();

    const blockedTimesQueryPromise = (async () => {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from("blocked_times")
          .select(
            "id, start_time, end_time, title, practice_cal_event_id, jam_cal_event_id, created_by, created_at",
          )
          .lt("start_time", timeMax.toISOString())
          .gt("end_time", timeMin.toISOString())
          .order("start_time", { ascending: true });
        if (error) {
          throw error;
        }
        return (data ?? []) as BlockedTimeRow[];
      } catch (blockedError) {
        console.error("Supabase blocked_times loading failed:", blockedError);
        return [] as BlockedTimeRow[];
      }
    })();

    const [
      currentUserProfile,
      practiceResponse,
      jamResponse,
      holdEvents,
      blockedTimeRows,
      fridayExceptions,
    ] = await Promise.all([
      currentUserProfilePromise,
      calendar.events.list({
        calendarId: practiceCalendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }),
      calendar.events.list({
        calendarId: jamCalendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }),
      holdQueryPromise,
      blockedTimesQueryPromise,
      fridayExceptionsPromise,
    ]);

    const isAdmin = await isAppAdmin(currentUserEmail);
    const currentUserContext = {
      currentUserEmail,
      currentUserWwuEmail: currentUserProfile?.walla_walla_email,
      currentUserNames: [
        currentUserProfile?.display_name,
        currentUserName,
      ].filter((value): value is string => Boolean(value)),
      adminEmail,
      isAdmin,
    };

    const blockedGCalIds = new Set<string>();
    for (const row of blockedTimeRows) {
      if (row.practice_cal_event_id) {
        blockedGCalIds.add(row.practice_cal_event_id);
      }
      if (row.jam_cal_event_id) {
        blockedGCalIds.add(row.jam_cal_event_id);
      }
    }

    const practiceEvents = (practiceResponse.data.items ?? [])
      .filter((event) => {
        const typed = event as GoogleApiEvent;
        return !typed.id || !blockedGCalIds.has(typed.id);
      })
      .map((event) =>
        mapGoogleEventToApiEvent(
          event as GoogleApiEvent,
          "practice",
          currentUserContext,
        ),
      )
      .filter(isNotNull);

    const jamEvents = (jamResponse.data.items ?? [])
      .filter((event) => {
        const typed = event as GoogleApiEvent;
        return !typed.id || !blockedGCalIds.has(typed.id);
      })
      .map((event) =>
        mapGoogleEventToApiEvent(
          event as GoogleApiEvent,
          "jam",
          currentUserContext,
        ),
      )
      .filter(isNotNull);

    const blockedEvents = blockedTimeRows.map((row) =>
      mapBlockedTimeToApiEvent(row, isAdmin),
    );

    return NextResponse.json({
      events: [
        ...practiceEvents,
        ...jamEvents,
        ...holdEvents,
        ...blockedEvents,
      ],
      fridayExceptions,
      quarter,
    });
  } catch (error) {
    console.error("Error loading calendar events:", error);

    return NextResponse.json(
      { error: "Failed to load calendar events." },
      { status: 500 },
    );
  }
}