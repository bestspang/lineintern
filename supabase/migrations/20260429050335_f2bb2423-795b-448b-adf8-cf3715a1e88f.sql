SELECT cron.schedule(
  'verify-line-webhook-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://phhxdgaiwgaiuecvfjgj.supabase.co/functions/v1/verify-line-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);