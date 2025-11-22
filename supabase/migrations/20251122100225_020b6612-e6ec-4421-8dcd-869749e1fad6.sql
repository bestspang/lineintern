-- Add history command to bot_commands
INSERT INTO bot_commands (
  command_key,
  display_name_en,
  display_name_th,
  description_en,
  description_th,
  usage_example_en,
  usage_example_th,
  category,
  icon_name,
  display_order,
  is_enabled,
  require_mention_in_group,
  available_in_dm,
  available_in_group
) VALUES (
  'history',
  'Attendance History',
  'ประวัติการเข้างาน',
  'View your personal attendance history for the last 30 days. Only available in DM.',
  'ดูประวัติการเข้างานของคุณย้อนหลัง 30 วัน ใช้งานได้เฉพาะในแชทส่วนตัวเท่านั้น',
  'Send "history" in DM to the bot',
  'ส่ง "history" หรือ "ประวัติ" ในแชทส่วนตัวกับบอท',
  'attendance',
  'History',
  33,
  true,
  false,
  true,
  false
) ON CONFLICT (command_key) DO NOTHING;

-- Add command aliases for history
INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT 
  bc.id,
  'history' as alias_text,
  'en' as language,
  true as is_primary,
  true as is_prefix,
  false as case_sensitive
FROM bot_commands bc
WHERE bc.command_key = 'history'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT 
  bc.id,
  'ประวัติ' as alias_text,
  'th' as language,
  false as is_primary,
  true as is_prefix,
  false as case_sensitive
FROM bot_commands bc
WHERE bc.command_key = 'history'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT 
  bc.id,
  'ประวัติการเข้างาน' as alias_text,
  'th' as language,
  false as is_primary,
  true as is_prefix,
  false as case_sensitive
FROM bot_commands bc
WHERE bc.command_key = 'history'
ON CONFLICT DO NOTHING;