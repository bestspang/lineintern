-- Add reply settings for receipt system
-- These control when the bot replies to receipt submissions in groups

INSERT INTO receipt_settings (setting_key, setting_value, description)
VALUES 
  ('reply_on_success', '{"enabled": true}', 'Send confirmation message when receipt is saved successfully'),
  ('reply_on_duplicate', '{"enabled": true}', 'Send notification when duplicate receipt is detected'),
  ('reply_on_error', '{"enabled": true}', 'Send notification when error occurs during receipt processing')
ON CONFLICT (setting_key) DO NOTHING;