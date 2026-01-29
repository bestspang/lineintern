-- Add auto-checkout notification settings columns
ALTER TABLE attendance_settings
ADD COLUMN IF NOT EXISTS auto_checkout_notify_dm BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_checkout_notify_group BOOLEAN DEFAULT true;

COMMENT ON COLUMN attendance_settings.auto_checkout_notify_dm IS 
  'Send auto-checkout notification to employee DM';
COMMENT ON COLUMN attendance_settings.auto_checkout_notify_group IS 
  'Send auto-checkout notification to announcement group';