/**
 * @file Temporary hold creation endpoint (`POST /api/holds/create`).
 *
 * Creates a short-lived "pending" row in Supabase `reservation_holds` that
 * prevents other users from selecting the same time slot while the current
 * user fills in the reservation form.
 *
 * Pipeline:
 * 1. **Auth + validation** — signed-in user, valid start/end, feature flag on.
 * 2. **Google Calendar overlap check** — ensures no existing practice or jam
 *    event already covers the requested window.
 * 3. **Supabase hold overlap check** — queries for any pending, non-expired
 *    hold that overlaps `[start, end)`.
 * 4. **Insert** — writes the hold with a 30-second TTL (`expires_at`).
 *    The client is responsible for converting the hold to a full reservation
 *    before expiry via `/api/reserve`.
 *
 * @see {@link @/app/api/reserve/route} — consumes and deletes the hold on booking
 * @see {@link @/app/api/holds/release/route} — manual hold release by owner/admin
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  checkGoogleCalendarOverlap,
  validateBookingTimes,
} from "@/lib/calendar-helpers";
import { getCalendarClient } from "@/lib/google";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Handles `POST /api/holds/create`.
 *
 * Accepts `{ start, end }` (ISO-8601 strings) and returns the created hold's
 * `{ holdId, start, end, expiresAt }` on success.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const ownerEmail = session?.user?.email?.toLowerCase();
    const ownerName = session?.user?.name || "";

    if (!ownerEmail) {
      return NextResponse.json(
        { error: "You must sign in to reserve the room." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const start = body.start;
    const end = body.end;

    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing start or end time." },
        { status: 400 },
      );
    }

    const validation = validateBookingTimes(start, end);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status },
      );
    }

    if (process.env.ENABLE_TEMP_HOLDS !== "true") {
      return NextResponse.json(
        { error: "Temporary holds unavailable." },
        { status: 503 },
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

    try {
      const supabase = getSupabaseAdmin();
      const nowIso = new Date().toISOString();

      const { data: overlappingHolds, error: holdQueryError } = await supabase
        .from("reservation_holds")
        .select("id")
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .lt("start_at", end)
        .gt("end_at", start);

      if (holdQueryError) {
        throw holdQueryError;
      }

      if ((overlappingHolds ?? []).length > 0) {
        return NextResponse.json(
          { error: "That time is temporarily being held by another user." },
          { status: 409 },
        );
      }

      // 30-second TTL — long enough for the user to complete the form,
      // short enough that abandoned holds free the slot quickly.
      const expiresAt = new Date(Date.now() + 30 * 1000).toISOString();

      const { data: createdHold, error: insertError } = await supabase
        .from("reservation_holds")
        .insert({
          owner_email: ownerEmail,
          owner_name: ownerName,
          start_at: start,
          end_at: end,
          expires_at: expiresAt,
          status: "pending",
        })
        .select("id, start_at, end_at, expires_at")
        .single();

      if (insertError || !createdHold) {
        throw insertError || new Error("Failed to create hold.");
      }

      return NextResponse.json({
        holdId: createdHold.id,
        start: createdHold.start_at,
        end: createdHold.end_at,
        expiresAt: createdHold.expires_at,
      });
    } catch (supabaseError) {
      console.error("Supabase hold creation failed:", supabaseError);

      return NextResponse.json(
        { error: "Temporary hold unavailable." },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error("Error creating temporary hold:", error);

    return NextResponse.json(
      { error: "Failed to create temporary hold." },
      { status: 500 },
    );
  }
}