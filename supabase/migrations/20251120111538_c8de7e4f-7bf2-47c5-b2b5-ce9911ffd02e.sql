-- Add /reminders command to bot_commands
INSERT INTO bot_commands (
  command_key,
  display_name_en,
  display_name_th,
  description_en,
  description_th,
  usage_example_en,
  usage_example_th,
  available_in_dm,
  available_in_group,
  require_mention_in_group,
  is_enabled,
  display_order,
  icon_name
) VALUES (
  'reminders',
  'List Work Reminders',
  'รายการเตือนความจำ',
  'Show all pending reminders for work tasks',
  'แสดงรายการเตือนความจำสำหรับงานที่มอบหมาย',
  '/reminders',
  '/เตือน',
  false,
  true,
  false,
  true,
  70,
  '⏰'
) ON CONFLICT (command_key) DO UPDATE SET
  display_name_en = EXCLUDED.display_name_en,
  display_name_th = EXCLUDED.display_name_th,
  description_en = EXCLUDED.description_en,
  description_th = EXCLUDED.description_th,
  updated_at = now();

-- Add command aliases for /reminders
INSERT INTO command_aliases (
  command_id,
  alias_text,
  language,
  is_prefix,
  is_primary,
  case_sensitive
) 
SELECT 
  id,
  '/reminders',
  'en',
  true,
  true,
  false
FROM bot_commands
WHERE command_key = 'reminders'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (
  command_id,
  alias_text,
  language,
  is_prefix,
  is_primary,
  case_sensitive
) 
SELECT 
  id,
  '/เตือน',
  'th',
  true,
  true,
  false
FROM bot_commands
WHERE command_key = 'reminders'
ON CONFLICT DO NOTHING;