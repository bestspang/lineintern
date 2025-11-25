-- Step 2: Create webapp_menu_config table and insert default data
CREATE TABLE IF NOT EXISTS webapp_menu_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  menu_group text NOT NULL,
  can_access boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role, menu_group)
);

-- Enable RLS
ALTER TABLE webapp_menu_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view webapp_menu_config"
  ON webapp_menu_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage webapp_menu_config"
  ON webapp_menu_config FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Insert default visibility rules
INSERT INTO webapp_menu_config (role, menu_group, can_access) VALUES
-- Admin sees everything
('admin', 'Dashboard', true),
('admin', 'Content & Knowledge', true),
('admin', 'Management', true),
('admin', 'AI Features', true),
('admin', 'Attendance', true),
('admin', 'Monitoring & Tools', true),
('admin', 'Configuration', true),

-- Executive sees Dashboard, Management, Attendance
('executive', 'Dashboard', true),
('executive', 'Content & Knowledge', false),
('executive', 'Management', true),
('executive', 'AI Features', false),
('executive', 'Attendance', true),
('executive', 'Monitoring & Tools', false),
('executive', 'Configuration', false),

-- Manager sees Dashboard, Attendance only
('manager', 'Dashboard', true),
('manager', 'Content & Knowledge', false),
('manager', 'Management', false),
('manager', 'AI Features', false),
('manager', 'Attendance', true),
('manager', 'Monitoring & Tools', false),
('manager', 'Configuration', false),

-- Field sees Dashboard, Attendance only
('field', 'Dashboard', true),
('field', 'Content & Knowledge', false),
('field', 'Management', false),
('field', 'AI Features', false),
('field', 'Attendance', true),
('field', 'Monitoring & Tools', false),
('field', 'Configuration', false),

-- Moderator sees most except Configuration
('moderator', 'Dashboard', true),
('moderator', 'Content & Knowledge', true),
('moderator', 'Management', true),
('moderator', 'AI Features', true),
('moderator', 'Attendance', true),
('moderator', 'Monitoring & Tools', true),
('moderator', 'Configuration', false),

-- Regular user sees Dashboard, Attendance only
('user', 'Dashboard', true),
('user', 'Content & Knowledge', false),
('user', 'Management', false),
('user', 'AI Features', false),
('user', 'Attendance', true),
('user', 'Monitoring & Tools', false),
('user', 'Configuration', false)

ON CONFLICT (role, menu_group) DO NOTHING;