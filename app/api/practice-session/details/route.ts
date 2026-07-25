/**
 * @file GET /api/practice-session/details
 *
 * Admin-only endpoint that resolves a practice Google Calendar event to its
 * corresponding Notion page in the Fillout Form Master Database. Returns the
 * Notion page URL, current Session Status, page ID, and patchlist link.
 *
 * Reads from the Supabase `practice_session_cache` table first. Only queries
 * Notion when the cache misses or the entry is stale (>5 min), then backfills
 * the cache. Pass **`revalidate=1`** to skip the warm-cache fast path and
 * always read Notion (used by the calendar modal so Notion-side edits show up
 * without waiting for TTL expiry).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { getEventEnd, getEventStart } from "@/lib/calendar-helpers";
import { getCalendarClient } from "@/lib/google";
import {
  findPracticeNotionPageByCustomEventIds,
  hydratePracticeAssigneesFromPageIds,
} from "@/lib/notion";
import {
  getCachedSessions,
  upsertCacheEntry,
} from "@/lib/practice-session-cache";
import {
  buildPracticeCustomEventIdCandidatesFromGoogleEvent,
  customEventIdCandidateStrings,
} from "@/lib/practice-custom-event-id";
import type { GoogleApiEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const googleEventId = request.nextUrl.searchParams.get("googleEventId");
    if (!googleEventId) {
      return NextResponse.json(
        { error: "Missing googleEventId query parameter." },
        { status: 400 },
      );
    }

    const practiceCalendarId = process.env.PRACTICE_CALENDAR_ID;
    if (!practiceCalendarId) {
      return NextResponse.json(
        { error: "Missing PRACTICE_CALENDAR_ID." },
        { status: 500 },
      );
    }

    const calendar = getCalendarClient();
    const eventResponse = await calendar.events.get({
      calendarId: practiceCalendarId,
      eventId: googleEventId,
    });

    const event = eventResponse.data as GoogleApiEvent;
    const startRaw = getEventStart(event);
    const endRaw = getEventEnd(event);

    if (!startRaw || !endRaw) {
      return NextResponse.json({
        notionPageUrl: null,
        currentStatus: null,
        notionPageId: null,
        patchlistLink: null,
        assignees: [],
      });
    }

    const roomTz = process.env.ROOM_TIME_ZONE || "America/Los_Angeles";
    const candidates = buildPracticeCustomEventIdCandidatesFromGoogleEvent(
      event,
      roomTz,
    );
    const cacheKeys = customEventIdCandidateStrings(candidates);

    const revalidateParam =
      request.nextUrl.searchParams.get("revalidate") ?? "";
    const forceRefresh =
      revalidateParam === "1" ||
      revalidateParam.toLowerCase() === "true" ||
      revalidateParam.toLowerCase() === "yes";

    // Check Supabase cache first
    if (cacheKeys.length > 0) {
      const cached = await getCachedSessions(cacheKeys);
      const hit = cacheKeys
        .map((id) => cached.get(id))
        .find((row) => Boolean(row));

      if (hit && !forceRefresh) {
        const age = Date.now() - new Date(hit.cached_at).getTime();
        if (age < CACHE_TTL_MS) {
          return NextResponse.json({
            notionPageUrl: hit.notion_page_url,
            currentStatus: hit.session_status,
            notionPageId: hit.notion_page_id,
            patchlistLink: hit.patchlist_link,
            assignees: hit.assignees_json ?? [],
          });
        }
      }
    }

    // Cache miss or stale: query Notion
    const result = await findPracticeNotionPageByCustomEventIds(candidates);

    const assignees = result.assigneePageIds.length
      ? await hydratePracticeAssigneesFromPageIds(result.assigneePageIds)
      : [];

    // Backfill cache
    if (result.notionPageId && result.matchedCustomEventId) {
      upsertCacheEntry({
        custom_event_id: result.matchedCustomEventId,
        notion_page_id: result.notionPageId,
        notion_page_url: result.notionPageUrl,
        session_status: result.currentStatus,
        patchlist_link: result.patchlistLink,
        assignees_json: assignees,
      }).catch(() => {});
    }

    return NextResponse.json({
      notionPageUrl: result.notionPageUrl,
      currentStatus: result.currentStatus,
      notionPageId: result.notionPageId,
      patchlistLink: result.patchlistLink,
      assignees,
    });
  } catch (error) {
    console.error("[practice-session/details] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch practice session details." },
      { status: 500 },
    );
  }
}
