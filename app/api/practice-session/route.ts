/**
 * @file PATCH /api/practice-session
 *
 * Admin-only endpoint to update a practice session's time and/or status.
 *
 * Updates flow:
 * 1. Fetch the Google Calendar event to read current times.
 * 2. Build the OLD Custom Event ID from current times, query Notion for the page.
 * 3. If times changed: patch Google Calendar, build the NEW Custom Event ID.
 * 4. Batch-update Notion properties (Start Date/Time, Session Length, Custom
 *    Event ID, Session Status) in a single `pages.update` call.
 *
 * The lookup-before-mutate order ensures the Notion page is found using the
 * still-valid Custom Event ID before any times are changed.
 *
 * @see {@link @/lib/notion} — findPracticeNotionPage, updatePracticeSessionInNotion
 * @see {@link @/lib/practice-custom-event-id} — Custom Event ID builder
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { getEventEnd, getEventStart } from "@/lib/calendar-helpers";
import { getCalendarClient } from "@/lib/google";
import {
  assigneePageIdsAreInPeopleDirectory,
  findPracticeNotionPage,
  getCachedPeopleDirectorySummaries,
  hydrateAssigneesFromOrderedIds,
  updatePracticeSessionInNotion,
} from "@/lib/notion";
import { upsertCacheEntry } from "@/lib/practice-session-cache";
import {
  buildPracticeCustomEventIdFromGoogleEvent,
  buildPracticeCustomEventIdFromGoogleEventInTimeZone,
  formatUtcInstantForPracticeCustomEventId,
  PRACTICE_CUSTOM_EVENT_ID_PREFIX,
} from "@/lib/practice-custom-event-id";
import type { GoogleApiEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const warnings: string[] = [];

  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const googleEventId: string | undefined = body.googleEventId?.trim();
    const newStart: string | undefined = body.newStart?.trim();
    const newEnd: string | undefined = body.newEnd?.trim();
    const newStatus: string | undefined = body.newStatus?.trim();
    const newPatchlistLink: string | undefined =
      typeof body.newPatchlistLink === "string"
        ? body.newPatchlistLink.trim()
        : undefined;

    const rawAssigneeIds = body.newAssigneePageIds;
    const newAssigneePageIds: string[] | undefined = Array.isArray(
      rawAssigneeIds,
    )
      ? rawAssigneeIds
          .map((x: unknown) =>
            typeof x === "string" ? x.trim() : "",
          )
          .filter((id: string) => id.length > 0)
      : undefined;

    if (!googleEventId) {
      return NextResponse.json(
        { error: "Missing googleEventId." },
        { status: 400 },
      );
    }

    const timesChanged = Boolean(newStart && newEnd);
    const statusChanged = Boolean(newStatus);
    const patchlistChanged = newPatchlistLink !== undefined;
    const assigneesChanged = newAssigneePageIds !== undefined;

    if (!timesChanged && !statusChanged && !patchlistChanged && !assigneesChanged) {
      return NextResponse.json(
        { error: "No changes provided." },
        { status: 400 },
      );
    }

    let peopleDirectory: Awaited<
      ReturnType<typeof getCachedPeopleDirectorySummaries>
    > | null = null;

    if (assigneesChanged) {
      peopleDirectory = await getCachedPeopleDirectorySummaries();
      if (
        newAssigneePageIds &&
        !assigneePageIdsAreInPeopleDirectory(newAssigneePageIds, peopleDirectory)
      ) {
        return NextResponse.json(
          {
            error:
              "One or more assignee page IDs are not in the People directory.",
          },
          { status: 400 },
        );
      }
    }

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    const roomTimeZone =
      process.env.ROOM_TIME_ZONE || "America/Los_Angeles";

    if (!practiceCalendarId) {
      return NextResponse.json(
        { error: "Missing PRACTICE_CALENDAR_ID." },
        { status: 500 },
      );
    }

    // Step 1: Fetch the current Google Calendar event
    const calendar = getCalendarClient();
    const eventResponse = await calendar.events.get({
      calendarId: practiceCalendarId,
      eventId: googleEventId,
    });
    const event = eventResponse.data as GoogleApiEvent;

    const eventEndIso = getEventEnd(event);
    const eventEndMs = eventEndIso
      ? new Date(eventEndIso).getTime()
      : Number.NaN;
    if (Number.isFinite(eventEndMs) && eventEndMs <= Date.now()) {
      return NextResponse.json(
        {
          error:
            "This practice session has already ended and cannot be updated.",
        },
        { status: 409 },
      );
    }

    // Step 2: Build OLD Custom Event ID and look up Notion page
    let customEventId = buildPracticeCustomEventIdFromGoogleEvent(event);
    let notionResult = customEventId
      ? await findPracticeNotionPage(customEventId)
      : null;

    if (!notionResult?.notionPageId && customEventId) {
      const wallClockId =
        buildPracticeCustomEventIdFromGoogleEventInTimeZone(
          event,
          roomTimeZone,
        );
      if (wallClockId && wallClockId !== customEventId) {
        notionResult = await findPracticeNotionPage(wallClockId);
      }
    }

    const notionPageId = notionResult?.notionPageId ?? null;

    // Step 3: Update Google Calendar if times changed
    let newCustomEventId: string | undefined;

    if (timesChanged && newStart && newEnd) {
      await calendar.events.patch({
        calendarId: practiceCalendarId,
        eventId: googleEventId,
        requestBody: {
          start: { dateTime: newStart, timeZone: roomTimeZone },
          end: { dateTime: newEnd, timeZone: roomTimeZone },
        },
      });

      const newStartDate = new Date(newStart);
      const newEndDate = new Date(newEnd);
      const startSeg =
        formatUtcInstantForPracticeCustomEventId(newStartDate);
      const endSeg =
        formatUtcInstantForPracticeCustomEventId(newEndDate);

      if (startSeg && endSeg) {
        newCustomEventId = `${PRACTICE_CUSTOM_EVENT_ID_PREFIX}-${startSeg}-${endSeg}`;
      }
    }

    // Step 4: Update Notion
    if (notionPageId) {
      const sessionLengthHours =
        timesChanged && newStart && newEnd
          ? (new Date(newEnd).getTime() - new Date(newStart).getTime()) /
            3_600_000
          : undefined;

      const newAssigneeRelation = assigneesChanged
        ? (newAssigneePageIds ?? []).map((id) => ({ id }))
        : undefined;

      await updatePracticeSessionInNotion({
        notionPageId,
        newStartISO: newStart,
        sessionLengthHours,
        newCustomEventId,
        newStatus: statusChanged ? newStatus : undefined,
        newPatchlistLink: patchlistChanged ? newPatchlistLink : undefined,
        newAssigneeRelation,
      });

      if (!peopleDirectory) {
        peopleDirectory = await getCachedPeopleDirectorySummaries();
      }
      const assigneesForCache = assigneesChanged
        ? hydrateAssigneesFromOrderedIds(newAssigneePageIds ?? [], peopleDirectory)
        : hydrateAssigneesFromOrderedIds(
            notionResult?.assigneePageIds ?? [],
            peopleDirectory,
          );

      // Write updated values to Supabase cache so subsequent reads are instant
      const cacheId = newCustomEventId ?? customEventId;
      if (cacheId) {
        upsertCacheEntry({
          custom_event_id: cacheId,
          notion_page_id: notionPageId,
          notion_page_url: notionResult?.notionPageUrl ?? null,
          session_status: statusChanged
            ? newStatus
            : notionResult?.currentStatus ?? null,
          patchlist_link: patchlistChanged
            ? newPatchlistLink ?? null
            : notionResult?.patchlistLink ?? null,
          assignees_json: assigneesForCache,
        }).catch(() => {});
      }

      console.info("[practice-session] Admin update applied.", {
        admin: email,
        googleEventId,
        timesChanged,
        statusChanged,
        assigneesChanged,
        newStatus: statusChanged ? newStatus : undefined,
        notionPageId,
      });
    } else {
      const msg =
        "Notion page not found; Google Calendar updated but Notion was not updated.";
      warnings.push(msg);
      console.warn("[practice-session]", msg, { googleEventId });
    }

    return NextResponse.json({ success: true, warnings });
  } catch (error) {
    console.error("[practice-session] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update practice session." },
      { status: 500 },
    );
  }
}
