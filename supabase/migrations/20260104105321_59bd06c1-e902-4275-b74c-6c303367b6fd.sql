-- Phase 1.1: Fix attendance_reminders constraint to support all reminder types
ALTER TABLE attendance_reminders 
DROP CONSTRAINT IF EXISTS attendance_reminders_reminder_type_check;

ALTER TABLE attendance_reminders 
ADD CONSTRAINT attendance_reminders_reminder_type_check 
CHECK (reminder_type = ANY (ARRAY['check_in', 'check_out', 'soft_check_in', 'second_check_in', 'overtime_warning', 'work_reminder']));

-- Add unique constraint on alias_text for command_aliases
ALTER TABLE command_aliases
ADD CONSTRAINT command_aliases_alias_text_unique UNIQUE (alias_text);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_command_aliases_text ON command_aliases(alias_text);
CREATE INDEX IF NOT EXISTS idx_command_aliases_language ON command_aliases(language);