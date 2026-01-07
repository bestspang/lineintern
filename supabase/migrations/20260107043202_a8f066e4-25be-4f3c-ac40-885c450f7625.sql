-- Create receipt_settings table for global receipt configuration
CREATE TABLE IF NOT EXISTS receipt_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE receipt_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read settings
CREATE POLICY "Authenticated users can read receipt settings"
ON receipt_settings FOR SELECT
TO authenticated
USING (true);

-- Allow admin users to update settings
CREATE POLICY "Admins can manage receipt settings"
ON receipt_settings FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);

-- Insert default settings
INSERT INTO receipt_settings (setting_key, setting_value, description) VALUES
  ('enabled_groups', '{"mode": "all", "group_ids": []}', 'Which LINE groups can submit receipts: all, selected, or branch_linked'),
  ('default_categories', '["food", "transport", "utilities", "office", "other"]', 'Available receipt categories'),
  ('auto_assign_branch', '{"enabled": true}', 'Automatically assign receipt to branch based on group'),
  ('require_business', '{"enabled": false}', 'Require user to create a business before submitting receipts'),
  ('system_enabled', '{"enabled": true}', 'Global toggle to enable/disable receipt system')
ON CONFLICT (setting_key) DO NOTHING;

-- Add branch_id column to receipts table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'receipts' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE receipts ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add receipt_enabled to groups features if not exists
UPDATE groups 
SET features = COALESCE(features, '{}'::jsonb) || '{"receipts": true}'::jsonb
WHERE NOT (COALESCE(features, '{}'::jsonb) ? 'receipts');

-- Create updated_at trigger for receipt_settings
CREATE OR REPLACE FUNCTION update_receipt_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS receipt_settings_updated_at ON receipt_settings;
CREATE TRIGGER receipt_settings_updated_at
  BEFORE UPDATE ON receipt_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_receipt_settings_updated_at();