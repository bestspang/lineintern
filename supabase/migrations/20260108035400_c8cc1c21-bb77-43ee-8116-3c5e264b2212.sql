-- Add Infinite plan with ai_receipts_limit = -1 (means unlimited)
INSERT INTO receipt_plans (id, name, ai_receipts_limit, businesses_limit, price_thb)
VALUES ('infinite', 'Infinite', -1, 99, 0)
ON CONFLICT (id) DO NOTHING;

-- Add default plan setting for new users
INSERT INTO receipt_settings (setting_key, setting_value, description)
VALUES (
  'default_plan',
  '{"plan_id": "free"}',
  'Default plan for new users when they first use the receipt system'
)
ON CONFLICT (setting_key) DO NOTHING;