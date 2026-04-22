/**
 * In-memory TTL cache for App Profile Creation Log page IDs keyed by Google email.
 *
 * `syncProfileLogPresenceToNotion` runs often (tab visibility); skipping repeat
 * `dataSources.query` calls for the same user reduces Notion load. Entries are
 * invalidated when {@link syncProfileCreationLogToNotion} creates a new log row
 * (so the next presence sync can discover the new page id).
 *
 * Scoped per `data_source_id` so the cache stays correct if the env id changes.
 * Best-effort only: each serverless instance has its own Map (no cross-instance sharing).
 */

const TTL_MS = 90_000;

type Entry = { pageIds: string[]; expiresAtMs: number };

const store = new Map<string, Entry>();

function cacheKey(dataSourceId: string, googleEmail: string): string {
  return `${dataSourceId}\0${googleEmail.trim().toLowerCase()}`;
}

/**
 * Returns cached page ids if present and not expired; otherwise `undefined`.
 */
export function getProfileLogPageIdsFromCache(
  dataSourceId: string,
  googleEmail: string,
): string[] | undefined {
  const k = cacheKey(dataSourceId, googleEmail);
  const e = store.get(k);
  if (!e) return undefined;
  if (Date.now() >= e.expiresAtMs) {
    store.delete(k);
    return undefined;
  }
  return e.pageIds;
}

/**
 * Stores a copy of `pageIds` (including empty arrays — “no row yet”).
 */
export function setProfileLogPageIdsCache(
  dataSourceId: string,
  googleEmail: string,
  pageIds: string[],
): void {
  store.set(cacheKey(dataSourceId, googleEmail), {
    pageIds: [...pageIds],
    expiresAtMs: Date.now() + TTL_MS,
  });
}

/**
 * Drops the cache entry so the next presence sync re-queries Notion.
 */
export function invalidateProfileLogPageIdsCache(
  dataSourceId: string,
  googleEmail: string,
): void {
  store.delete(cacheKey(dataSourceId, googleEmail));
}
