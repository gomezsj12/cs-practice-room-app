/**
 * Read-through Supabase cache for Notion practice session data.
 *
 * The `practice_session_cache` table stores Session Status, Link to Patchlist,
 * assignees (denormalized JSON), Notion page URL, and page ID keyed by Custom
 * Event ID. This avoids hitting
 * Notion's rate-limited API on every calendar load / modal open.
 *
 * Cache is populated by:
 * - Batch-statuses API (backfills misses from Notion)
 * - Details API (backfills on cache miss or stale entry)
 * - PATCH API (writes after successful Notion update)
 * - Notion webhook (syncs on property changes in Notion)
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import type { PracticeAssigneeSummary } from "@/lib/types";

export type PracticeSessionCacheRow = {
  custom_event_id: string;
  notion_page_id: string | null;
  notion_page_url: string | null;
  session_status: string | null;
  patchlist_link: string | null;
  assignees_json: PracticeAssigneeSummary[] | null;
  cached_at: string;
};

/**
 * Bulk-read cached statuses for a list of Custom Event IDs.
 * Returns a Map keyed by custom_event_id.
 */
export async function getCachedSessions(
  customEventIds: string[],
): Promise<Map<string, PracticeSessionCacheRow>> {
  if (customEventIds.length === 0) return new Map();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("practice_session_cache")
    .select("*")
    .in("custom_event_id", customEventIds);

  if (error) {
    console.warn("[practice-session-cache] Bulk read failed:", error.message);
    return new Map();
  }

  const map = new Map<string, PracticeSessionCacheRow>();
  for (const row of data ?? []) {
    map.set(row.custom_event_id, row as PracticeSessionCacheRow);
  }
  return map;
}

/**
 * Upsert a single cache entry by custom_event_id.
 * Fire-and-forget safe: logs errors but does not throw.
 */
export async function upsertCacheEntry(entry: {
  custom_event_id: string;
  notion_page_id?: string | null;
  notion_page_url?: string | null;
  session_status?: string | null;
  patchlist_link?: string | null;
  assignees_json?: PracticeAssigneeSummary[] | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("practice_session_cache").upsert(
    {
      ...entry,
      cached_at: new Date().toISOString(),
    },
    { onConflict: "custom_event_id" },
  );

  if (error) {
    console.warn("[practice-session-cache] Upsert failed:", error.message);
  }
}

/**
 * Update cache entry by notion_page_id (used by webhooks where we know the
 * Notion page ID but not necessarily the custom_event_id).
 * Only updates rows that already exist.
 */
export async function updateCacheByNotionPageId(
  notionPageId: string,
  patch: {
    session_status?: string | null;
    patchlist_link?: string | null;
    assignees_json?: PracticeAssigneeSummary[] | null;
    custom_event_id?: string;
    notion_page_url?: string;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("practice_session_cache")
    .update({ ...patch, cached_at: new Date().toISOString() })
    .eq("notion_page_id", notionPageId);

  if (error) {
    console.warn(
      "[practice-session-cache] Update by notion_page_id failed:",
      error.message,
    );
  }
}

/**
 * Upsert a cache entry using notion_page_id as the match key. If no row
 * exists yet for this notion_page_id, inserts using the provided
 * custom_event_id as the primary key.
 */
export async function upsertCacheByNotionPageId(entry: {
  notion_page_id: string;
  custom_event_id: string;
  notion_page_url?: string | null;
  session_status?: string | null;
  patchlist_link?: string | null;
  assignees_json?: PracticeAssigneeSummary[] | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("practice_session_cache")
    .select("custom_event_id")
    .eq("notion_page_id", entry.notion_page_id)
    .limit(1);

  if (existing && existing.length > 0) {
    await updateCacheByNotionPageId(entry.notion_page_id, {
      session_status: entry.session_status,
      patchlist_link: entry.patchlist_link,
      assignees_json: entry.assignees_json,
      custom_event_id: entry.custom_event_id,
      notion_page_url: entry.notion_page_url ?? undefined,
    });
  } else {
    await upsertCacheEntry(entry);
  }
}
