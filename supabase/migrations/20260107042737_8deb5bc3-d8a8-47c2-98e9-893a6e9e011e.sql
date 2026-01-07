-- Add additional API configurations for future use
INSERT INTO api_configurations (key_name, description, description_th, source_url, is_required, category)
VALUES
  ('OPENAI_API_KEY', 'OpenAI API Key for advanced AI features', 'OpenAI API Key สำหรับ AI ขั้นสูง', 'https://platform.openai.com/api-keys', false, 'general'),
  ('GOOGLE_OAUTH_CLIENT_ID', 'Google OAuth Client ID for Drive/Sheets integration', 'Google OAuth Client ID สำหรับเชื่อมต่อ Drive/Sheets', 'https://console.cloud.google.com/apis/credentials', false, 'google')
ON CONFLICT (key_name) DO NOTHING;