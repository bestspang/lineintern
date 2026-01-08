INSERT INTO receipt_settings (setting_key, setting_value, description)
VALUES (
  'deposit_only_reply_enabled',
  '{"enabled": false}',
  'Whether to reply with "only deposit slips supported" message in deposit-only groups. Default: false (silent mode)'
)
ON CONFLICT (setting_key) DO NOTHING;