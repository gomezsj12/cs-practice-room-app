/**
 * @file POST /api/practice-session/batch-statuses
 *
 * Admin-only endpoint that resolves Notion Session Status for a batch of
 * practice Google Calendar events. Used by the calendar to show status-colored
 * outlines on practice events for admin users.
 *
 * Reads from the Supabase `practice_session_cache` table first. Only queries
 * Notion for cache misses, then backfills those results into Supabase.
 *
 * Accepts: `{ events: Array<{ googleEventId: string; start: string; end: string }> }`
 * Returns: `{ statuses: Record<string, string | null> }` — googleEventId → status name
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import {
  findPracticeNotionPage,
  hydratePracticeAssigneesFromPageIds,
} from "@/lib/notion";
import {
  getCachedSessions,
  upsertCacheEntry,
} from "@/lib/practice-session-cache";
import {
  formatUtcInstantForPracticeCustomEventId,
  formatWallClockInstantForPracticeCustomEventId,
  PRACTICE_CUSTOM_EVENT_ID_PREFIX,
} from "@/lib/practice-custom-event-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventInput = {
  googleEventId: string;
  start: string;
  end: string;
};

function buildCustomEventId(start: Date, end: Date): string | null {
  const startSeg = formatUtcInstantForPracticeCustomEventId(start);
  const endSeg = formatUtcInstantForPracticeCustomEventId(end);
  if (!startSeg || !endSeg) return null;
  return `${PRACTICE_CUSTOM_EVENT_ID_PREFIX}-${startSeg}-${endSeg}`;
}

function buildWallClockCustomEventId(
  start: Date,
  end: Date,
  tz: string,
): string | null {
  const startSeg = formatWallClockInstantForPracticeCustomEventId(start, tz);
  const endSeg = formatWallClockInstantForPracticeCustomEventId(end, tz);
  if (!startSeg || !endSeg) return null;
  return `${PRACTICE_CUSTOM_EVENT_ID_PREFIX}-${startSeg}-${endSeg}`;
}

type ResolvedEvent = {
  googleEventId: string;
  utcId: string | null;
  wallId: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const events: EventInput[] = Array.isArray(body?.events)
      ? body.events
      : [];

    if (events.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const roomTz = process.env.ROOM_TIME_ZONE || "America/Los_Angeles";

    // Build Custom Event IDs for all events
    const resolved: ResolvedEvent[] = events.map((ev) => {
      const startDate = new Date(ev.start);
      const endDate = new Date(ev.end);
      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        return { googleEventId: ev.googleEventId, utcId: null, wallId: null };
      }
      const utcId = buildCustomEventId(startDate, endDate);
      const wallId = buildWallClockCustomEventId(startDate, endDate, roomTz);
      return { googleEventId: ev.googleEventId, utcId, wallId };
    });

    // Collect all candidate IDs for a single Supabase bulk read
    const allCandidateIds = new Set<string>();
    for (const r of resolved) {
      if (r.utcId) allCandidateIds.add(r.utcId);
      if (r.wallId && r.wallId !== r.utcId) allCandidateIds.add(r.wallId);
    }

    const cached = await getCachedSessions([...allCandidateIds]);

    // Match cache hits to events, collect misses
    const statuses: Record<string, string | null> = {};
    const misses: ResolvedEvent[] = [];

    for (const r of resolved) {
      const utcHit = r.utcId ? cached.get(r.utcId) : undefined;
      const wallHit =
        r.wallId && r.wallId !== r.utcId ? cached.get(r.wallId) : undefined;
      const hit = utcHit ?? wallHit;

      if (hit) {
        statuses[r.googleEventId] = hit.session_status;
      } else if (r.utcId || r.wallId) {
        misses.push(r);
      }
    }

    // Backfill cache misses from Notion (rate-limited, 2 at a time)
    if (misses.length > 0) {
      const CONCURRENCY = 2;

      for (let i = 0; i < misses.length; i += CONCURRENCY) {
        const batch = misses.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (r) => {
            let result = r.utcId
              ? await findPracticeNotionPage(r.utcId)
              : null;

            let matchedId = r.utcId;
            if (!result?.notionPageId && r.wallId && r.wallId !== r.utcId) {
              result = await findPracticeNotionPage(r.wallId);
              if (result?.notionPageId) matchedId = r.wallId;
            }

            if (result && matchedId) {
              const assignees = result.assigneePageIds?.length
                ? await hydratePracticeAssigneesFromPageIds(result.assigneePageIds)
                : [];
              upsertCacheEntry({
                custom_event_id: matchedId,
                notion_page_id: result.notionPageId,
                notion_page_url: result.notionPageUrl,
                session_status: result.currentStatus,
                patchlist_link: result.patchlistLink,
                assignees_json: assignees,
              }).catch(() => {});
            }

            return {
              googleEventId: r.googleEventId,
              status: result?.currentStatus ?? null,
            };
          }),
        );

        for (const res of results) {
          if (res.status === "fulfilled" && res.value) {
            statuses[res.value.googleEventId] = res.value.status;
          }
        }
      }
    }

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("[practice-session/batch-statuses] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch batch statuses." },
      { status: 500 },
    );
  }
}
