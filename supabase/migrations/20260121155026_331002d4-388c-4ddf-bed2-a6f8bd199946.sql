-- Fix attendance_reminders constraint to allow 'ot_warning' and 'ot_exceeded'
-- These types are used by overtime-warning edge function

ALTER TABLE attendance_reminders 
DROP CONSTRAINT IF EXISTS attendance_reminders_reminder_type_check;

ALTER TABLE attendance_reminders 
ADD CONSTRAINT attendance_reminders_reminder_type_check 
CHECK (reminder_type = ANY (ARRAY[
  'check_in'::text, 
  'check_out'::text, 
  'soft_check_in'::text, 
  'second_check_in'::text, 
  'overtime_warning'::text, 
  'work_reminder'::text,
  'ot_warning'::text, 
  'ot_exceeded'::text
]));