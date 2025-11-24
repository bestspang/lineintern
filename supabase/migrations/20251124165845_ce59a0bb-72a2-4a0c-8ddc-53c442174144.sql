-- Create cron job for request timeout checker (runs every hour)
SELECT cron.schedule(
  'request-timeout-check',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/request-timeout-checker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);