-- Add Birthday Reminder Settings columns to attendance_settings
ALTER TABLE attendance_settings
ADD COLUMN IF NOT EXISTS birthday_reminder_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS birthday_reminder_days_ahead INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS birthday_reminder_time TIME DEFAULT '08:00:00',
ADD COLUMN IF NOT EXISTS birthday_reminder_line_group_id TEXT;

-- Add comment for documentation
COMMENT ON COLUMN attendance_settings.birthday_reminder_enabled IS 'Enable/disable birthday reminder notifications';
COMMENT ON COLUMN attendance_settings.birthday_reminder_days_ahead IS 'Number of days ahead to notify (1-14)';
COMMENT ON COLUMN attendance_settings.birthday_reminder_time IS 'Time to send birthday reminder (Thai time)';
COMMENT ON COLUMN attendance_settings.birthday_reminder_line_group_id IS 'Optional specific LINE group for birthday reminders';