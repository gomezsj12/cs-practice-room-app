-- Enable pg_cron (job scheduler) and pg_net (async HTTP from SQL)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Sweep stale presence every 2 minutes.
-- Calls POST /<APP_BASE_URL>/api/cron/presence-sweep, authorized with the
-- same CRON_SECRET used by the quarter sync cron.
--
-- ⚠️  BEFORE APPLYING THIS MIGRATION:
--   1. Replace `<APP_BASE_URL>` with your deployed app URL
--      (e.g. https://your-app.vercel.app).
--   2. Replace `<CRON_SECRET>` with the value of the `CRON_SECRET` env var
--      configured on your Vercel project. The token must match what
--      `/api/cron/presence-sweep` checks against.
--   3. If you'd rather not paste the secret into a tracked file, use
--      Supabase Vault and wrap the schedule in a DO block that reads
--      `vault.decrypted_secrets`. See docs/ARCHITECTURE.md.
--
-- If CRON_SECRET is rotated later, run `cron.unschedule('presence-sweep')`
-- and re-register the job with the new Authorization header.
SELECT cron.schedule(
  'presence-sweep',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := '<APP_BASE_URL>/api/cron/presence-sweep',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);
