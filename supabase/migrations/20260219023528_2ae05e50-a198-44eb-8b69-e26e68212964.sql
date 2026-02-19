ALTER TABLE public.attendance_settings 
ADD COLUMN IF NOT EXISTS work_reminder_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS work_summary_enabled boolean DEFAULT true;