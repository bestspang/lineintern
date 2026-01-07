-- Add portal_access_mode setting
INSERT INTO system_settings (setting_key, setting_value, category, description, is_editable)
VALUES (
  'portal_access_mode',
  '{"mode": "liff", "available_modes": ["liff", "token"]}',
  'portal',
  'Portal access mode: liff (default - direct LINE login) or token (legacy link-based login)',
  true
) ON CONFLICT (setting_key) DO NOTHING;