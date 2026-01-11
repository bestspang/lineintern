-- Add cancel_ot command to bot_commands table
INSERT INTO bot_commands (
  command_key, 
  category, 
  display_name_th, 
  display_name_en,
  description_th, 
  description_en,
  usage_example_th,
  usage_example_en,
  available_in_dm,
  available_in_group,
  is_enabled
) VALUES (
  'cancel_ot',
  'attendance',
  'ยกเลิก OT',
  'Cancel OT',
  'ยกเลิกคำขอ OT ที่ยังรออนุมัติ',
  'Cancel a pending OT request',
  'ยกเลิกโอที, /cancel-ot, /cancel-ot พรุ่งนี้',
  '/cancel-ot, /cancel-ot tomorrow',
  true,
  false,
  true
)
ON CONFLICT (command_key) DO NOTHING;