-- Cache for Notion practice session data (Session Status, Link to Patchlist, etc.)
-- Read-through cache: calendar reads from here instead of hitting Notion directly.
-- Populated by: batch-statuses backfill, details API backfill, PATCH API writes,
-- and the Notion webhook on property updates.

CREATE TABLE practice_session_cache (
  custom_event_id  text PRIMARY KEY,
  notion_page_id   text,
  notion_page_url  text,
  session_status   text,
  patchlist_link   text,
  cached_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE practice_session_cache ENABLE ROW LEVEL SECURITY;

-- No policies granted to anon/authenticated — only the service-role key
-- (which bypasses RLS) can read/write this table.

CREATE INDEX idx_psc_notion_page_id ON practice_session_cache (notion_page_id);
