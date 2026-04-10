/**
 * @file Calendar event cancellation endpoint (`POST /api/cancel`).
 *
 * Authorization logic:
 * - **Jam events**: the signed-in Google email must match either the event's
 *   `ownerEmail` (stored in `extendedProperties.private`) or `ADMIN_EMAIL`.
 * - **Practice events**: the signed-in user's linked WWU email must be an
 *   attendee **and** their name must match the title segment after the hyphen.
 * - Events whose end time has already passed cannot be cancelled.
 *
 * After deleting a jam event, the route also fires a best-effort Notion update
 * to mark the row as cancelled; Notion failures are logged but don't affect
 * the HTTP response.
 *
 * @see {@link @/lib/calendar-helpers} — `getEventEnd`
 * @see {@link @/lib/notion} — `markJamReservationCancelledInNotion`
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  canUserCancelJamEvent,
  canUserCancelPracticeEvent,
} from "@/lib/calendar-events";
import { getEventEnd } from "@/lib/calendar-helpers";
import { getCalendarClient } from "@/lib/google";
import { markJamReservationCancelledInNotion } from "@/lib/notion";
import { getProfileByGoogleEmail } from "@/lib/profile-helpers";
import type { GoogleApiEvent } from "@/lib/types";

/**
 * Handles `POST /api/cancel`.
 *
 * Accepts `{ googleEventId, eventType }`, verifies ownership/admin privilege
 * and that the event hasn't ended, then deletes it from the appropriate
 * Google Calendar.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const sessionUserEmail = session?.user?.email || null;
    const sessionUserName = session?.user?.name || undefined;
    const currentUserEmail = sessionUserEmail?.toLowerCase();
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

    if (!currentUserEmail) {
      return NextResponse.json(
        { error: "You must sign in to cancel this booking." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const googleEventId = body.googleEventId?.trim();
    const eventType = body.eventType;

    if (!googleEventId) {
      return NextResponse.json(
        { error: "Missing googleEventId." },
        { status: 400 },
      );
    }

    if (eventType !== "jam" && eventType !== "practice") {
      return NextResponse.json(
        { error: "Missing or invalid eventType." },
        { status: 400 },
      );
    }

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    const jamCalendarId = process.env.JAM_CALENDAR_ID;
    const calendarId =
      eventType === "practice" ? practiceCalendarId : jamCalendarId;

    if (!calendarId) {
      return NextResponse.json(
        {
          error:
            eventType === "practice"
              ? "Missing PRACTICE_CALENDAR_ID environment variable."
              : "Missing JAM_CALENDAR_ID environment variable.",
        },
        { status: 500 },
      );
    }

    const calendar = getCalendarClient();

    const eventResponse = await calendar.events.get({
      calendarId,
      eventId: googleEventId,
    });

    const event = eventResponse.data as GoogleApiEvent;
    const endStr = getEventEnd(event);
    const endDate = new Date(endStr);
    const currentUserProfile =
      eventType === "practice" && sessionUserEmail
        ? await getProfileByGoogleEmail(sessionUserEmail)
        : null;

    if (!endStr || Number.isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Could not read this booking’s end time." },
        { status: 400 },
      );
    }

    if (Date.now() >= endDate.getTime()) {
      return NextResponse.json(
        {
          error:
            "This booking has already ended and can\u2019t be cancelled.",
        },
        { status: 400 },
      );
    }

    const canCancel =
      eventType === "jam"
        ? canUserCancelJamEvent(event, currentUserEmail, adminEmail)
        : canUserCancelPracticeEvent(
            event,
            currentUserProfile?.walla_walla_email,
            [currentUserProfile?.display_name, sessionUserName],
          );

    if (!canCancel) {
      return NextResponse.json(
        {
          error:
            eventType === "practice"
              ? "You can only cancel your own practice booking."
              : "You can only cancel your own reservation.",
        },
        { status: 403 },
      );
    }

    await calendar.events.delete({
      calendarId,
      eventId: googleEventId,
    });

    if (eventType === "jam") {
      try {
        await markJamReservationCancelledInNotion(googleEventId);
      } catch (notionError) {
        console.error("Notion cancel logging failed:", notionError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cancelling calendar event:", error);

    return NextResponse.json(
      { error: "Failed to cancel booking." },
      { status: 500 },
    );
  }
}