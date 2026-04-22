-- Enable pg_cron (job scheduler) and pg_net (async HTTP from SQL)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Sweep stale presence every 2 minutes.
-- Calls POST /api/cron/presence-sweep on the production Vercel app,
-- authorized with the same CRON_SECRET used by the quarter sync cron.
-- If CRON_SECRET changes, update the Authorization header here too.
SELECT cron.schedule(
  'presence-sweep',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wwu-cspr.app/api/cron/presence-sweep',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);
