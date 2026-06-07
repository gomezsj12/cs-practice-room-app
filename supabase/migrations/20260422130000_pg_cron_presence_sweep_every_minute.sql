-- Run presence sweep every minute (was */2). Idempotent for fresh installs.
--
-- ⚠️  BEFORE APPLYING: replace `<APP_BASE_URL>` and `<CRON_SECRET>` with the
-- same values used in the previous presence-sweep migration. See
-- `20260422010000_pg_cron_presence_sweep.sql` for full setup notes.
SELECT cron.unschedule('presence-sweep');

SELECT cron.schedule(
  'presence-sweep',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := '<APP_BASE_URL>/api/cron/presence-sweep',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);
