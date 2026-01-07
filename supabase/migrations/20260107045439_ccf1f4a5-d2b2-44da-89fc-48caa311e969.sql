-- Add collection_mode setting for centralized vs mapped mode
INSERT INTO receipt_settings (setting_key, setting_value, description)
VALUES (
  'collection_mode',
  '{"mode": "mapped", "centralized_group_id": null}'::jsonb,
  'Receipt collection mode: mapped (per-group branch) or centralized (single group, no branch tagging)'
)
ON CONFLICT (setting_key) DO NOTHING;