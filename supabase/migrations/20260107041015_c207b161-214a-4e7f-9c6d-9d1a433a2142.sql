-- Add new receipt-related commands
INSERT INTO bot_commands (command_key, category, display_name_en, display_name_th, description_en, description_th, usage_example_en, usage_example_th, display_order, is_enabled, available_in_dm, available_in_group, icon_name)
VALUES
  ('export_month', 'receipt', 'Export Month', 'ส่งออกรายเดือน', 'Export receipt summary for a specific month', 'ส่งออกสรุปใบเสร็จของเดือนที่ระบุ', '/export 2026-01', '/ส่งออก มกราคม', 24, true, true, false, 'Download'),
  ('this_month', 'receipt', 'This Month', 'เดือนนี้', 'View this month receipt summary', 'ดูสรุปใบเสร็จเดือนนี้', '/thismonth', '/เดือนนี้', 25, true, true, false, 'Calendar'),
  ('set_default_business', 'receipt', 'Set Default Business', 'ตั้งค่าธุรกิจเริ่มต้น', 'Set default business for receipts', 'ตั้งค่าธุรกิจเริ่มต้นสำหรับใบเสร็จ', '/setdefault Company A', '/ตั้งค่าเริ่มต้น บริษัท ก', 26, true, true, false, 'Building')
ON CONFLICT (command_key) DO NOTHING;

-- Add aliases for new commands
INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/export', 'en', true FROM bot_commands WHERE command_key = 'export_month'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/ส่งออก', 'th', true FROM bot_commands WHERE command_key = 'export_month'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/thismonth', 'en', true FROM bot_commands WHERE command_key = 'this_month'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/เดือนนี้', 'th', true FROM bot_commands WHERE command_key = 'this_month'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, 'เดือนนี้', 'th', false FROM bot_commands WHERE command_key = 'this_month'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/setdefault', 'en', true FROM bot_commands WHERE command_key = 'set_default_business'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/ตั้งค่าเริ่มต้น', 'th', true FROM bot_commands WHERE command_key = 'set_default_business'
ON CONFLICT DO NOTHING;