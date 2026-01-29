ALTER TABLE attendance_settings
ADD COLUMN IF NOT EXISTS auto_checkout_notify_admin_group BOOLEAN DEFAULT false;

COMMENT ON COLUMN attendance_settings.auto_checkout_notify_admin_group IS 
  'Send auto-checkout notification to admin LINE group';