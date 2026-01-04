-- Add admin notification group setting
INSERT INTO system_settings (setting_key, setting_value, category, description, is_editable)
VALUES (
  'admin_notification_group',
  '{"line_group_id": "C831b995b55f6f75ae3b7fef832a4f30f", "name": "Good Lime"}'::jsonb,
  'bot',
  'LINE group ID for admin/debug notifications and error alerts. All errors will be sent here instead of customer groups.',
  true
)
ON CONFLICT (setting_key) DO UPDATE 
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description;