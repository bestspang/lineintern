-- Add selfie detection settings
INSERT INTO receipt_settings (setting_key, setting_value, description) VALUES
  ('selfie_detection_enabled', '{"enabled": true}', 'Enable selfie detection for receipt submissions'),
  ('selfie_confidence_threshold', '{"value": 0.95}', 'Minimum confidence to reject as selfie (0.80-0.99)'),
  ('reply_on_selfie_rejected', '{"enabled": true}', 'Notify user when selfie is rejected')
ON CONFLICT (setting_key) DO NOTHING;