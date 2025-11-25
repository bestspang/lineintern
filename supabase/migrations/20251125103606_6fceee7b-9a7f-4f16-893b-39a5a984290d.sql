-- Create summary delivery logs table
CREATE TABLE IF NOT EXISTS summary_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES summary_delivery_config(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT now(),
  recipients_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_summary_delivery_logs_config_id ON summary_delivery_logs(config_id);
CREATE INDEX IF NOT EXISTS idx_summary_delivery_logs_sent_at ON summary_delivery_logs(sent_at DESC);

-- Remove old daily cron job
SELECT cron.unschedule('daily-attendance-summary');

-- Remove duplicate reminder cron
SELECT cron.unschedule('attendance-reminder-15min');

-- Create new hourly cron job for attendance summary
SELECT cron.schedule(
  'hourly-attendance-summary',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/attendance-daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqenpxZnpnbnNsZWZxaG5zbWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjkyMDQsImV4cCI6MjA3OTAwNTIwNH0.lwfsxDP3u8jck6iIZ8eBygyo0_Q7TwBwR06HpxOLC4c'
    ),
    body := jsonb_build_object('time', now()::text)
  ) as request_id;
  $$
);