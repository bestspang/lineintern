-- Add owner role to webapp_menu_config (currently missing)
INSERT INTO webapp_menu_config (role, menu_group, can_access)
VALUES 
  ('owner', 'Dashboard', true),
  ('owner', 'Attendance', true),
  ('owner', 'Management', true),
  ('owner', 'Content & Knowledge', true),
  ('owner', 'AI Features', true),
  ('owner', 'Monitoring & Tools', true),
  ('owner', 'Configuration', true)
ON CONFLICT (role, menu_group) DO NOTHING;