/**
 * @file Admin blocked-time CRUD endpoint (`POST` / `DELETE /api/blocked-times`).
 *
 * **POST** creates a blocked-off period:
 * 1. Auth: requires admin session.
 * 2. Validation: min 30 min, no max, no past-day restriction skipped for admins.
 * 3. Overlap check: rejects if the range overlaps any existing non-blocked
 *    Google Calendar event on either calendar.
 * 4. Google Calendar insert: creates an event on BOTH practice and jam
 *    calendars with `extendedProperties.private.blockedTime: "true"`.
 * 5. Supabase insert: stores the paired event IDs in `blocked_times`.
 *
 * **DELETE** removes a blocked-off period:
 * 1. Auth: requires admin session.
 * 2. Supabase lookup: fetches the row by `blockedTimeId`.
 * 3. Google Calendar delete: removes events from both calendars.
 * 4. Supabase delete: removes the row.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import {
  checkGoogleCalendarOverlap,
  validateBlockedTimes,
} from "@/lib/calendar-helpers";
import { getCalendarClient } from "@/lib/google";
import {
  bookingIntervalWithinDataWindow,
  getResolvedCalendarDataWindow,
} from "@/lib/quarter-window";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { BlockedTimeRow } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { start, end, title } = body;

    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing start or end time." },
        { status: 400 },
      );
    }

    const validation = validateBlockedTimes(start, end);
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

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    const jamCalendarId = process.env.JAM_CALENDAR_ID;
    const roomTimeZone = process.env.ROOM_TIME_ZONE || "America/Los_Angeles";

    if (!practiceCalendarId || !jamCalendarId) {
      return NextResponse.json(
        { error: "Missing calendar IDs in environment variables." },
        { status: 500 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: overlappingBlocks } = await supabase
      .from("blocked_times")
      .select("id")
      .lt("start_time", end)
      .gt("end_time", start)
      .limit(1);

    if (overlappingBlocks && overlappingBlocks.length > 0) {
      return NextResponse.json(
        { error: "That time overlaps with an existing blocked period." },
        { status: 409 },
      );
    }

    const calendar = getCalendarClient();

    const overlap = await checkGoogleCalendarOverlap(
      calendar,
      practiceCalendarId,
      jamCalendarId,
      start,
      end,
      true,
    );

    if (overlap.overlapping) {
      return NextResponse.json(
        { error: overlap.error },
        { status: 409 },
      );
    }

    const eventTitle = title?.trim() || "Practice Room Closed";
    const eventBody = {
      summary: eventTitle,
      start: { dateTime: start, timeZone: roomTimeZone },
      end: { dateTime: end, timeZone: roomTimeZone },
      extendedProperties: {
        private: { blockedTime: "true", createdBy: email },
      },
    };

    const [practiceEvent, jamEvent] = await Promise.all([
      calendar.events.insert({
        calendarId: practiceCalendarId,
        requestBody: eventBody,
      }),
      calendar.events.insert({
        calendarId: jamCalendarId,
        requestBody: eventBody,
      }),
    ]);

    const { data: row, error: dbError } = await supabase
      .from("blocked_times")
      .insert({
        start_time: start,
        end_time: end,
        title: eventTitle,
        practice_cal_event_id: practiceEvent.data.id ?? null,
        jam_cal_event_id: jamEvent.data.id ?? null,
        created_by: email,
      })
      .select("id, start_time, end_time, title, practice_cal_event_id, jam_cal_event_id, created_by, created_at")
      .single();

    if (dbError) {
      console.error("[blocked-times] Supabase insert failed:", dbError);
      return NextResponse.json(
        { error: "Failed to save blocked time." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: `blocked-${row.id}`,
      blockedTimeId: row.id,
      eventType: "blocked",
      title: eventTitle,
      start,
      end,
      color: "rgba(239,68,68,0.16)",
      textColor: "#ffffff",
      canCancel: true,
    });
  } catch (error) {
    console.error("[blocked-times] Error creating blocked time:", error);
    return NextResponse.json(
      { error: "Failed to create blocked time." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const blockedTimeId = body.blockedTimeId?.trim();

    if (!blockedTimeId) {
      return NextResponse.json(
        { error: "Missing blockedTimeId." },
        { status: 400 },
      );
    }

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    const jamCalendarId = process.env.JAM_CALENDAR_ID;

    if (!practiceCalendarId || !jamCalendarId) {
      return NextResponse.json(
        { error: "Missing calendar IDs in environment variables." },
        { status: 500 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: row, error: fetchError } = await supabase
      .from("blocked_times")
      .select(
        "id, start_time, end_time, title, practice_cal_event_id, jam_cal_event_id, created_by, created_at",
      )
      .eq("id", blockedTimeId)
      .maybeSingle();

    if (fetchError) {
      console.error("[blocked-times] Supabase fetch failed:", fetchError);
      return NextResponse.json(
        { error: "Failed to look up blocked time." },
        { status: 500 },
      );
    }

    if (!row) {
      return NextResponse.json(
        { error: "Blocked time not found." },
        { status: 404 },
      );
    }

    const typedRow = row as BlockedTimeRow;
    const calendar = getCalendarClient();

    const deletions: Promise<unknown>[] = [];

    if (typedRow.practice_cal_event_id) {
      deletions.push(
        calendar.events
          .delete({
            calendarId: practiceCalendarId,
            eventId: typedRow.practice_cal_event_id,
          })
          .catch((err) => {
            console.error(
              "[blocked-times] Failed to delete practice calendar event:",
              err,
            );
          }),
      );
    }

    if (typedRow.jam_cal_event_id) {
      deletions.push(
        calendar.events
          .delete({
            calendarId: jamCalendarId,
            eventId: typedRow.jam_cal_event_id,
          })
          .catch((err) => {
            console.error(
              "[blocked-times] Failed to delete jam calendar event:",
              err,
            );
          }),
      );
    }

    await Promise.all(deletions);

    const { error: deleteError } = await supabase
      .from("blocked_times")
      .delete()
      .eq("id", blockedTimeId);

    if (deleteError) {
      console.error("[blocked-times] Supabase delete failed:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete blocked time record." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[blocked-times] Error deleting blocked time:", error);
    return NextResponse.json(
      { error: "Failed to delete blocked time." },
      { status: 500 },
    );
  }
}
