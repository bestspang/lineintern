-- Add LINE Login credentials for LIFF API
INSERT INTO api_configurations (key_name, description, description_th, category, source_url, is_required)
VALUES 
  ('LINE_LOGIN_CHANNEL_ID', 'LINE Login Channel ID for LIFF API management', 'LINE Login Channel ID สำหรับจัดการ LIFF API', 'line', 'https://developers.line.biz/console/', false),
  ('LINE_LOGIN_CHANNEL_SECRET', 'LINE Login Channel Secret for LIFF API management', 'LINE Login Channel Secret สำหรับจัดการ LIFF API', 'line', 'https://developers.line.biz/console/', false),
  ('LIFF_ID', 'LIFF App ID for portal access', 'LIFF App ID สำหรับเข้าถึง Portal', 'line', 'https://developers.line.biz/console/', false)
ON CONFLICT (key_name) DO NOTHING;