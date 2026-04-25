-- Unschedule the cron job
SELECT cron.unschedule('deposit-reminder-hourly');

-- Drop deposit tables (CASCADE removes any dependent objects)
DROP TABLE IF EXISTS public.deposit_approval_logs CASCADE;
DROP TABLE IF EXISTS public.deposit_reminders CASCADE;
DROP TABLE IF EXISTS public.daily_deposits CASCADE;
DROP TABLE IF EXISTS public.deposit_settings CASCADE;