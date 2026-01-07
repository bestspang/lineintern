-- Add receipt commands to bot_commands table
INSERT INTO bot_commands (
  command_key, category, display_name_en, display_name_th,
  description_en, description_th, usage_example_en, usage_example_th,
  display_order, is_enabled, available_in_dm, available_in_group
) VALUES
('receipt', 'receipt', 'Receipt Help', 'วิธีใช้ใบเสร็จ',
 'Show how to use receipt tracking feature', 'แสดงวิธีการใช้งานบันทึกใบเสร็จ',
 '/receipt', '/ใบเสร็จ',
 70, true, true, false),
('receiptsummary', 'receipt', 'Receipt Summary', 'สรุปใบเสร็จ',
 'Show receipt summary for this month and year', 'แสดงสรุปใบเสร็จรายเดือนและรายปี',
 '/receiptsummary', '/สรุปใบเสร็จ',
 71, true, true, false),
('businesses', 'receipt', 'My Businesses', 'ธุรกิจของฉัน',
 'List and manage your businesses for receipts', 'แสดงและจัดการธุรกิจสำหรับใบเสร็จ',
 '/businesses', '/ธุรกิจ',
 72, true, true, false)
ON CONFLICT (command_key) DO NOTHING;

-- Add command aliases for receipt commands
INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/receipt', 'en', true FROM bot_commands WHERE command_key = 'receipt'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/ใบเสร็จ', 'th', true FROM bot_commands WHERE command_key = 'receipt'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/บันทึกใบเสร็จ', 'th', false FROM bot_commands WHERE command_key = 'receipt'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/receiptsummary', 'en', true FROM bot_commands WHERE command_key = 'receiptsummary'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/สรุปใบเสร็จ', 'th', true FROM bot_commands WHERE command_key = 'receiptsummary'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/businesses', 'en', true FROM bot_commands WHERE command_key = 'businesses'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/ธุรกิจ', 'th', true FROM bot_commands WHERE command_key = 'businesses'
ON CONFLICT DO NOTHING;