-- Denormalized assignees for practice sessions (relation "Assignee(s)" in Notion).
-- Populated with details API, PATCH, batch backfill, and Notion webhooks.

ALTER TABLE practice_session_cache
  ADD COLUMN IF NOT EXISTS assignees_json jsonb;
