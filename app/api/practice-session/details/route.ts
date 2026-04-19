/**
 * @file GET /api/practice-session/details
 *
 * Admin-only endpoint that resolves a practice Google Calendar event to its
 * corresponding Notion page in the Fillout Form Master Database. Returns the
 * Notion page URL, current Session Status, page ID, and patchlist link.
 *
 * Reads from the Supabase `practice_session_cache` table first. Only queries
 * Notion when the cache misses or the entry is stale (>5 min), then backfills
 * the cache.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import { getEventEnd, getEventStart } from "@/lib/calendar-helpers";
import { getCalendarClient } from "@/lib/google";
import { findPracticeNotionPage } from "@/lib/notion";
import {
  getCachedSessions,
  upsertCacheEntry,
} from "@/lib/practice-session-cache";
import {
  buildPracticeCustomEventIdFromGoogleEvent,
  buildPracticeCustomEventIdFromGoogleEventInTimeZone,
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
      });
    }

    const roomTz = process.env.ROOM_TIME_ZONE || "America/Los_Angeles";
    const utcId = buildPracticeCustomEventIdFromGoogleEvent(event);
    const wallId = buildPracticeCustomEventIdFromGoogleEventInTimeZone(
      event,
      roomTz,
    );

    // Check Supabase cache first
    const candidateIds = [
      ...(utcId ? [utcId] : []),
      ...(wallId && wallId !== utcId ? [wallId] : []),
    ];

    if (candidateIds.length > 0) {
      const cached = await getCachedSessions(candidateIds);
      const hit = (utcId ? cached.get(utcId) : undefined) ??
        (wallId && wallId !== utcId ? cached.get(wallId) : undefined);

      if (hit) {
        const age = Date.now() - new Date(hit.cached_at).getTime();
        if (age < CACHE_TTL_MS) {
          return NextResponse.json({
            notionPageUrl: hit.notion_page_url,
            currentStatus: hit.session_status,
            notionPageId: hit.notion_page_id,
            patchlistLink: hit.patchlist_link,
          });
        }
      }
    }

    // Cache miss or stale — query Notion
    let customEventId = utcId;
    let result = customEventId
      ? await findPracticeNotionPage(customEventId)
      : null;

    let matchedId = customEventId;
    if (!result?.notionPageId && customEventId) {
      if (wallId && wallId !== customEventId) {
        result = await findPracticeNotionPage(wallId);
        if (result?.notionPageId) matchedId = wallId;
      }
    }

    // Backfill cache
    if (result && matchedId) {
      upsertCacheEntry({
        custom_event_id: matchedId,
        notion_page_id: result.notionPageId,
        notion_page_url: result.notionPageUrl,
        session_status: result.currentStatus,
        patchlist_link: result.patchlistLink,
      }).catch(() => {});
    }

    return NextResponse.json({
      notionPageUrl: result?.notionPageUrl ?? null,
      currentStatus: result?.currentStatus ?? null,
      notionPageId: result?.notionPageId ?? null,
      patchlistLink: result?.patchlistLink ?? null,
    });
  } catch (error) {
    console.error("[practice-session/details] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch practice session details." },
      { status: 500 },
    );
  }
}
