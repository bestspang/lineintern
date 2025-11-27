-- Add missing database aliases for commands

-- 1. Add aliases for ask command
INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/ask', 'en', true, true
FROM bot_commands WHERE command_key = 'ask'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/ถาม', 'th', false, true
FROM bot_commands WHERE command_key = 'ask'
ON CONFLICT DO NOTHING;

-- 2. Add slash aliases for attendance commands
INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/checkin', 'en', true, true
FROM bot_commands WHERE command_key = 'checkin'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/เช็คอิน', 'th', false, true
FROM bot_commands WHERE command_key = 'checkin'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/checkout', 'en', true, true
FROM bot_commands WHERE command_key = 'checkout'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/เช็คเอาต์', 'th', false, true
FROM bot_commands WHERE command_key = 'checkout'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/history', 'en', true, true
FROM bot_commands WHERE command_key = 'history'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/ประวัติ', 'th', false, true
FROM bot_commands WHERE command_key = 'history'
ON CONFLICT DO NOTHING;

-- 3. Add slash aliases for confirm_with_feedback
INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/confirm', 'en', true, true
FROM bot_commands WHERE command_key = 'confirm_with_feedback'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/ยืนยัน', 'th', false, true
FROM bot_commands WHERE command_key = 'confirm_with_feedback'
ON CONFLICT DO NOTHING;

-- 4. Add /ตั้งเตือน for remind command
INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/ตั้งเตือน', 'th', false, true
FROM bot_commands WHERE command_key = 'remind'
ON CONFLICT DO NOTHING;

-- Update knowledge items to fix /เตือน conflict
-- English: Available Commands
UPDATE knowledge_items
SET content = REPLACE(
  content,
  '- `/remind [task] [time]` or `/เตือน` - Set a reminder',
  '- `/remind [task] [time]` or `/ตั้งเตือน` - Set a reminder
- `/reminders` or `/เตือน` - List all pending reminders'
)
WHERE title = 'Available Commands' 
  AND scope = 'global';

-- Thai: คำสั่งที่มีทั้งหมด
UPDATE knowledge_items
SET content = REPLACE(
  content,
  '- `/remind [งาน] [เวลา]` หรือ `/เตือน` - ตั้งเตือน',
  '- `/remind [งาน] [เวลา]` หรือ `/ตั้งเตือน` - ตั้งเตือน
- `/reminders` หรือ `/เตือน` - ดูรายการเตือนทั้งหมด'
)
WHERE title = 'คำสั่งที่มีทั้งหมด'
  AND scope = 'global';