-- Add grace_period_minutes to attendance_settings
ALTER TABLE attendance_settings 
ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 15;

COMMENT ON COLUMN attendance_settings.grace_period_minutes IS 
'จำนวนนาทีที่อนุญาตให้สาย ก่อนที่จะถือว่า "late" (default: 15 นาที)';