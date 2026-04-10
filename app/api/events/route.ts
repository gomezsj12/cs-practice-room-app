/**
 * @file Calendar events API route (`GET /api/events`).
 *
 * Merges three data sources into a single event array for the calendar UI:
 * 1. **Practice bookings** — events from the practice Google Calendar with
 *    cleaned description text and owner-only cancellation eligibility.
 * 2. **Jam reservations** — events from the jam Google Calendar (cancellable by owner/admin).
 * 3. **Temporary holds** — pending rows from Supabase `reservation_holds`
 *    (only when `ENABLE_TEMP_HOLDS=true`).
 *
 * All three queries run in parallel via `Promise.all` to minimise latency.
 * Google Calendar and Supabase failures are handled independently so a
 * Supabase outage doesn't block calendar display.
 *
 * @see {@link @/lib/google} — Google Calendar service-account client
 * @see {@link @/lib/supabase} — Supabase admin client
 * @see {@link @/lib/types} — `ApiCalendarEvent`, `GoogleApiEvent`, `HoldRow`
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  canUserCancelJamEvent,
  canUserCancelPracticeEvent,
  cleanCalendarEventDescription,
  sanitizeCalendarEventAttendees,
} from "@/lib/calendar-events";
import { getCalendarClient } from "@/lib/google";
import { getProfileByGoogleEmail } from "@/lib/profile-helpers";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  ApiCalendarEvent,
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
        )
      : canUserCancelPracticeEvent(
          event,
          context.currentUserWwuEmail,
          context.currentUserNames,
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

/**
 * Handles `GET /api/events`.
 *
 * Fetches practice events, jam events, and pending holds in parallel,
 * maps them into a unified `ApiCalendarEvent[]`, and returns the merged list.
 * The window is `now − 7 days` → `now + 30 days`.
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

    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 7);

    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 30);

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

    const [currentUserProfile, practiceResponse, jamResponse, holdEvents] =
      await Promise.all([
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
      ]);

    const currentUserContext = {
      currentUserEmail,
      currentUserWwuEmail: currentUserProfile?.walla_walla_email,
      currentUserNames: [
        currentUserProfile?.display_name,
        currentUserName,
      ].filter((value): value is string => Boolean(value)),
      adminEmail,
    };

    const practiceEvents = (practiceResponse.data.items ?? [])
      .map((event) =>
        mapGoogleEventToApiEvent(
          event as GoogleApiEvent,
          "practice",
          currentUserContext,
        ),
      )
      .filter(isNotNull);

    const jamEvents = (jamResponse.data.items ?? [])
      .map((event) =>
        mapGoogleEventToApiEvent(
          event as GoogleApiEvent,
          "jam",
          currentUserContext,
        ),
      )
      .filter(isNotNull);

    return NextResponse.json([...practiceEvents, ...jamEvents, ...holdEvents]);
  } catch (error) {
    console.error("Error loading calendar events:", error);

    return NextResponse.json(
      { error: "Failed to load calendar events." },
      { status: 500 },
    );
  }
}