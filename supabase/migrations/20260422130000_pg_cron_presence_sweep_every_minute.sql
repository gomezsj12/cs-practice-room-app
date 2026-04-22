-- Run presence sweep every minute (was */2). Idempotent for fresh installs.
SELECT cron.unschedule('presence-sweep');

SELECT cron.schedule(
  'presence-sweep',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wwu-cspr.app/api/cron/presence-sweep',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);
