-- Phase 1: Add Attendance Commands to bot_commands

-- Insert checkin command
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
) VALUES
(
  'checkin',
  'Check In',
  'เช็คอิน',
  'Check in to work by taking a photo and confirming your location. Only available in DM.',
  'เช็คอินเข้างานด้วยการถ่ายรูปและยืนยันตำแหน่ง ใช้งานได้เฉพาะในแชทส่วนตัวเท่านั้น',
  'Send "checkin" in DM to the bot',
  'ส่ง "checkin" หรือ "เช็คอิน" ในแชทส่วนตัวกับบอท',
  'attendance',
  'ClipboardCheck',
  31,
  true,
  false,
  true,
  false
),
(
  'checkout',
  'Check Out',
  'เช็คเอาต์',
  'Check out from work by taking a photo and confirming your location. Only available in DM.',
  'เช็คเอาต์ออกจากงานด้วยการถ่ายรูปและยืนยันตำแหน่ง ใช้งานได้เฉพาะในแชทส่วนตัวเท่านั้น',
  'Send "checkout" in DM to the bot',
  'ส่ง "checkout" หรือ "เช็คเอาต์" ในแชทส่วนตัวกับบอท',
  'attendance',
  'ClipboardCheck',
  32,
  true,
  false,
  true,
  false
);

-- Add command aliases for checkin
INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT 
  bc.id,
  'checkin',
  'en',
  true,
  true,
  false
FROM bot_commands bc WHERE bc.command_key = 'checkin';

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT bc.id, 'check in', 'en', false, true, false FROM bot_commands bc WHERE bc.command_key = 'checkin';

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT bc.id, 'เช็คอิน', 'th', true, true, false FROM bot_commands bc WHERE bc.command_key = 'checkin';

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT bc.id, 'เข้างาน', 'th', false, true, false FROM bot_commands bc WHERE bc.command_key = 'checkin';

-- Add command aliases for checkout
INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT bc.id, 'checkout', 'en', true, true, false FROM bot_commands bc WHERE bc.command_key = 'checkout';

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT bc.id, 'check out', 'en', false, true, false FROM bot_commands bc WHERE bc.command_key = 'checkout';

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT bc.id, 'เช็คเอาต์', 'th', true, true, false FROM bot_commands bc WHERE bc.command_key = 'checkout';

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
SELECT bc.id, 'ออกงาน', 'th', false, true, false FROM bot_commands bc WHERE bc.command_key = 'checkout';