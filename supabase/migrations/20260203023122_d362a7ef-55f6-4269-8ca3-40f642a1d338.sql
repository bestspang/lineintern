-- 1. Add /status command to bot_commands
INSERT INTO bot_commands (
  command_key, 
  display_name_th, display_name_en,
  description_th, description_en,
  category, display_order, 
  icon_name, is_enabled,
  available_in_dm, available_in_group,
  min_role_priority, require_mention_in_group
) VALUES (
  'status',
  'สถานะ AI', 'AI Status',
  'ดูสถานะบุคลิกภาพและหน่วยความจำของ AI', 'View AI personality and memory status',
  'general', 3,
  'Activity', true,
  true, true,
  0, false
) ON CONFLICT (command_key) DO NOTHING;

-- 2. Add aliases for /status command
INSERT INTO command_aliases (command_id, alias_text, is_prefix, is_primary, language)
SELECT id, '/status', true, true, 'en' FROM bot_commands WHERE command_key = 'status'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, is_prefix, is_primary, language)
SELECT id, '/สถานะ', true, true, 'th' FROM bot_commands WHERE command_key = 'status'
ON CONFLICT DO NOTHING;

-- 3. Update FAQ wording to clarify "DM only" for cancel commands
UPDATE portal_faqs 
SET 
  answer_th = 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-ot ใน DM (แชทส่วนตัว) กับบอท',
  answer_en = 'Go to Portal > Work History, click "Cancel" button, or type /cancel-ot in DM (direct message) with the bot.'
WHERE question_th = 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?';

UPDATE portal_faqs 
SET 
  answer_th = 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-dayoff ใน DM (แชทส่วนตัว) กับบอท',
  answer_en = 'Go to Portal > Work History, click "Cancel" button, or type /cancel-dayoff in DM (direct message) with the bot.'
WHERE question_th = 'ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?';