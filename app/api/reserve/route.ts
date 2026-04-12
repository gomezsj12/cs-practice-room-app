/**
 * @file Jam reservation creation endpoint (`POST /api/reserve`).
 *
 * Full booking pipeline:
 * 1. **Auth** — requires a signed-in Google session.
 * 2. **Validation** — checks required fields and booking-time constraints.
 * 3. **Hold verification** (optional) — if a `holdId` is supplied and temp
 *    holds are enabled, verifies ownership, pending status, expiry, and
 *    slot-time match (±1 s tolerance). Falls back to the standard flow on failure.
 * 4. **Google Calendar overlap check** — queries both practice and jam
 *    calendars for conflicting events.
 * 5. **Google Calendar insert** — creates the jam event with `ownerEmail`
 *    stored in `extendedProperties.private` for ownership tracking.
 * 6. **Notion log** (fire-and-forget) — records the reservation; failures
 *    are logged but don't block the response.
 * 7. **Hold cleanup** — deletes the Supabase hold row after a successful booking.
 *
 * @see {@link @/lib/calendar-helpers} — `validateBookingTimes`, `checkGoogleCalendarOverlap`
 * @see {@link @/lib/notion} — `createJamReservationInNotion`
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  checkGoogleCalendarOverlap,
  validateBookingTimes,
} from "@/lib/calendar-helpers";
import { getCalendarClient } from "@/lib/google";
import { createJamReservationInNotion } from "@/lib/notion";
import {
  bookingIntervalWithinDataWindow,
  getResolvedCalendarDataWindow,
} from "@/lib/quarter-window";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { HoldRow } from "@/lib/types";

/**
 * Handles `POST /api/reserve`.
 *
 * Accepts `{ name, instrument, start, end, holdId? }` and creates a Google
 * Calendar event on the jam calendar after verifying no overlaps. Returns the
 * normalised event payload on success.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const ownerEmail = session?.user?.email?.toLowerCase();
    const ownerName = session?.user?.name || "";

    if (!ownerEmail) {
      return NextResponse.json(
        { error: "You must sign in to create a reservation." },
        { status: 401 },
      );
    }

    const body = await request.json();

    const name = body.name?.trim();
    const instrument = body.instrument?.trim();
    const start = body.start;
    const end = body.end;
    const holdId = body.holdId?.trim();

    if (!name || !instrument || !start || !end) {
      return NextResponse.json(
        { error: "Missing required reservation fields." },
        { status: 400 },
      );
    }

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    const jamCalendarId = process.env.JAM_CALENDAR_ID;
    const roomTimeZone =
      process.env.ROOM_TIME_ZONE || "America/Los_Angeles";

    if (!practiceCalendarId || !jamCalendarId) {
      return NextResponse.json(
        { error: "Missing calendar IDs in environment variables." },
        { status: 500 },
      );
    }

    const validation = validateBookingTimes(start, end);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status },
      );
    }

    const dataWindow = await getResolvedCalendarDataWindow();
    const windowCheck = bookingIntervalWithinDataWindow(
      start,
      end,
      dataWindow.timeMin,
      dataWindow.timeMax,
    );
    if (!windowCheck.ok) {
      return NextResponse.json({ error: windowCheck.error }, { status: 400 });
    }

    // Tracks whether the booking was backed by a verified hold; returned to
    // the client so the UI can skip a redundant calendar refresh.
    let holdWasVerified = false;

    if (process.env.ENABLE_TEMP_HOLDS === "true" && holdId) {
      try {
        const supabase = getSupabaseAdmin();

        const { data: hold, error: holdError } = await supabase
          .from("reservation_holds")
          .select(
            "id, owner_email, start_at, end_at, expires_at, status",
          )
          .eq("id", holdId)
          .maybeSingle();

        if (holdError) {
          throw holdError;
        }

        if (!hold) {
          return NextResponse.json(
            { error: "Your temporary hold no longer exists." },
            { status: 409 },
          );
        }

        const typedHold = hold as HoldRow;

        if (typedHold.owner_email.toLowerCase() !== ownerEmail) {
          return NextResponse.json(
            { error: "This hold belongs to another user." },
            { status: 403 },
          );
        }

        if (typedHold.status !== "pending") {
          return NextResponse.json(
            { error: "This temporary hold is no longer active." },
            { status: 409 },
          );
        }

        if (new Date(typedHold.expires_at).getTime() <= Date.now()) {
          return NextResponse.json(
            { error: "Your temporary hold expired." },
            { status: 409 },
          );
        }

        const holdStartMs = new Date(typedHold.start_at).getTime();
        const holdEndMs = new Date(typedHold.end_at).getTime();
        const requestStartMs = new Date(start).getTime();
        const requestEndMs = new Date(end).getTime();

        // Allow ±1 s drift between the hold and the submitted times to
        // tolerate minor serialisation rounding across timezones.
        if (
          Math.abs(holdStartMs - requestStartMs) > 1000 ||
          Math.abs(holdEndMs - requestEndMs) > 1000
        ) {
          return NextResponse.json(
            { error: "The booking slot does not match your temporary hold." },
            { status: 409 },
          );
        }

        holdWasVerified = true;
      } catch (holdVerificationError) {
        console.error(
          "Hold verification failed, falling back to standard booking flow:",
          holdVerificationError,
        );
      }
    }

    const calendar = getCalendarClient();

    const overlap = await checkGoogleCalendarOverlap(
      calendar,
      practiceCalendarId,
      jamCalendarId,
      start,
      end,
    );

    if (overlap.overlapping) {
      return NextResponse.json(
        { error: overlap.error },
        { status: 409 },
      );
    }

    const createdEvent = await calendar.events.insert({
      calendarId: jamCalendarId,
      requestBody: {
        summary: `${name} - ${instrument}`,
        start: {
          dateTime: start,
          timeZone: roomTimeZone,
        },
        end: {
          dateTime: end,
          timeZone: roomTimeZone,
        },
        extendedProperties: {
          private: {
            ownerEmail,
            ownerName,
          },
        },
      },
    });

    try {
      if (createdEvent.data.id) {
        await createJamReservationInNotion({
          name,
          instrument,
          start,
          end,
          googleEventId: createdEvent.data.id,
          ownerEmail,
        });
      }
    } catch (notionError) {
      console.error("Notion logging failed:", notionError);
    }

    if (process.env.ENABLE_TEMP_HOLDS === "true" && holdId) {
      try {
        const supabase = getSupabaseAdmin();

        await supabase.from("reservation_holds").delete().eq("id", holdId);
      } catch (releaseError) {
        console.error("Failed to delete hold after booking:", releaseError);
      }
    }

    return NextResponse.json({
      id: `jam-${createdEvent.data.id}`,
      googleEventId: createdEvent.data.id,
      eventType: "jam",
      title: createdEvent.data.summary || `${name} - ${instrument}`,
      start:
        createdEvent.data.start?.dateTime ||
        createdEvent.data.start?.date ||
        start,
      end:
        createdEvent.data.end?.dateTime || createdEvent.data.end?.date || end,
      color: "#3f56c9",
      textColor: "#ffffff",
      canCancel: true,
      holdWasVerified,
    });
  } catch (error) {
    console.error("Error creating reservation:", error);

    return NextResponse.json(
      { error: "Failed to create reservation." },
      { status: 500 },
    );
  }
}