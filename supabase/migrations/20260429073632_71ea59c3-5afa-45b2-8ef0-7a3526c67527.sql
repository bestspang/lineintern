-- Phase 0A finishing: schedule nightly audit_logs cleanup.
-- Run at 17:15 UTC = 00:15 Asia/Bangkok. Retention window: 180 days.
-- Idempotent: drop any existing job with the same name first.

SELECT cron.unschedule('audit-logs-cleanup-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'audit-logs-cleanup-daily'
);

SELECT cron.schedule(
  'audit-logs-cleanup-daily',
  '15 17 * * *',
  $$SELECT public.cleanup_audit_logs(180);$$
);