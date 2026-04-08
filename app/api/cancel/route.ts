import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getEventEnd } from "@/lib/calendar-helpers";
import { getCalendarClient } from "@/lib/google";
import { markJamReservationCancelledInNotion } from "@/lib/notion";
import type { GoogleApiEvent } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const currentUserEmail = session?.user?.email?.toLowerCase();
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

    if (!currentUserEmail) {
      return NextResponse.json(
        { error: "You must sign in to cancel a reservation." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const googleEventId = body.googleEventId?.trim();

    if (!googleEventId) {
      return NextResponse.json(
        { error: "Missing googleEventId." },
        { status: 400 },
      );
    }

    const jamCalendarId = process.env.JAM_CALENDAR_ID;

    if (!jamCalendarId) {
      return NextResponse.json(
        { error: "Missing JAM_CALENDAR_ID environment variable." },
        { status: 500 },
      );
    }

    const calendar = getCalendarClient();

    const eventResponse = await calendar.events.get({
      calendarId: jamCalendarId,
      eventId: googleEventId,
    });

    const event = eventResponse.data as GoogleApiEvent;
    const endStr = getEventEnd(event);
    const endDate = new Date(endStr);

    if (!endStr || Number.isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Could not read this reservation’s end time." },
        { status: 400 },
      );
    }

    if (Date.now() >= endDate.getTime()) {
      return NextResponse.json(
        {
          error:
            "This reservation has already ended and can\u2019t be cancelled.",
        },
        { status: 400 },
      );
    }

    const ownerEmail =
      event.extendedProperties?.private?.ownerEmail?.toLowerCase() || "";

    const canCancel =
      currentUserEmail === adminEmail ||
      (!!ownerEmail && currentUserEmail === ownerEmail);

    if (!canCancel) {
      return NextResponse.json(
        { error: "You can only cancel your own reservation." },
        { status: 403 },
      );
    }

    await calendar.events.delete({
      calendarId: jamCalendarId,
      eventId: googleEventId,
    });

    try {
      await markJamReservationCancelledInNotion(googleEventId);
    } catch (notionError) {
      console.error("Notion cancel logging failed:", notionError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cancelling reservation:", error);

    return NextResponse.json(
      { error: "Failed to cancel reservation." },
      { status: 500 },
    );
  }
}