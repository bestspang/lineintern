-- Add system preset columns to summary_delivery_config
ALTER TABLE summary_delivery_config 
  ADD COLUMN is_system BOOLEAN DEFAULT false,
  ADD COLUMN preset_type TEXT;

-- Add comment for preset_type
COMMENT ON COLUMN summary_delivery_config.preset_type IS 'Preset type: per_employee (send to each employee), per_branch (send to each branch group), null (custom)';

-- Insert system presets
INSERT INTO summary_delivery_config (name, is_system, preset_type, source_type, send_time, include_work_hours, is_enabled) VALUES
  ('📤 ส่งรายงานรายบุคคล', true, 'per_employee', 'all_branches', '21:00:00', true, false),
  ('🏢 ส่งรายงานรายสาขา', true, 'per_branch', 'all_branches', '21:00:00', true, false),
  ('📊 ส่งทุกสาขาไป Management', true, null, 'all_branches', '21:00:00', true, false);