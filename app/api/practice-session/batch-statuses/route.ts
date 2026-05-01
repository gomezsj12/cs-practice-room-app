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
 * Accepts:
 * `{ events: Array<{ googleEventId: string; start: string; end: string; description?: string }> }`
 *
 * Returns:
 * `{ statuses: Record<string, string | null> }`
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAppAdmin } from "@/lib/admin";
import {
  findPracticeNotionPageByCustomEventIds,
  hydratePracticeAssigneesFromPageIds,
} from "@/lib/notion";
import {
  getCachedSessions,
  upsertCacheEntry,
} from "@/lib/practice-session-cache";
import { buildPracticeCustomEventIdCandidatesFromDateRange } from "@/lib/practice-custom-event-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventInput = {
  googleEventId: string;
  start: string;
  end: string;
  description?: string;
};

type ResolvedEvent = {
  googleEventId: string;
  candidateIds: string[];
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email || !(await isAppAdmin(email))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const events: EventInput[] = Array.isArray(body?.events) ? body.events : [];

    if (events.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const roomTz = process.env.ROOM_TIME_ZONE || "America/Los_Angeles";

    const resolved: ResolvedEvent[] = events.map((ev) => {
      const startDate = new Date(ev.start);
      const endDate = new Date(ev.end);
      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        return { googleEventId: ev.googleEventId, candidateIds: [] };
      }

      return {
        googleEventId: ev.googleEventId,
        candidateIds: buildPracticeCustomEventIdCandidatesFromDateRange({
          start: startDate,
          end: endDate,
          timeZone: roomTz,
          description: ev.description,
        }),
      };
    });

    const allCandidateIds = new Set<string>();
    for (const r of resolved) {
      for (const candidateId of r.candidateIds) {
        allCandidateIds.add(candidateId);
      }
    }

    const cached = await getCachedSessions([...allCandidateIds]);

    const statuses: Record<string, string | null> = {};
    const misses: ResolvedEvent[] = [];

    for (const r of resolved) {
      const hit = r.candidateIds
        .map((id) => cached.get(id))
        .find((row) => Boolean(row));

      if (hit) {
        statuses[r.googleEventId] = hit.session_status;
      } else if (r.candidateIds.length > 0) {
        misses.push(r);
      }
    }

    if (misses.length > 0) {
      const CONCURRENCY = 2;

      for (let i = 0; i < misses.length; i += CONCURRENCY) {
        const batch = misses.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (r) => {
            const result = await findPracticeNotionPageByCustomEventIds(
              r.candidateIds,
            );

            if (result.notionPageId && result.matchedCustomEventId) {
              const assignees = result.assigneePageIds.length
                ? await hydratePracticeAssigneesFromPageIds(result.assigneePageIds)
                : [];
              upsertCacheEntry({
                custom_event_id: result.matchedCustomEventId,
                notion_page_id: result.notionPageId,
                notion_page_url: result.notionPageUrl,
                session_status: result.currentStatus,
                patchlist_link: result.patchlistLink,
                assignees_json: assignees,
              }).catch(() => {});
            }

            return {
              googleEventId: r.googleEventId,
              status: result.currentStatus,
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
