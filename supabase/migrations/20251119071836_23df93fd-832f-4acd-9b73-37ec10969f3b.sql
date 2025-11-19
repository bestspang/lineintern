-- Register /mode command and aliases
INSERT INTO public.bot_commands (
  command_key,
  display_name_en,
  display_name_th,
  description_en,
  description_th,
  usage_example_en,
  usage_example_th,
  is_enabled,
  require_mention_in_group,
  available_in_dm,
  available_in_group,
  display_order,
  icon_name
) VALUES (
  'mode',
  'Change Mode',
  'เปลี่ยนโหมด',
  'Switch the bot''s behavior mode (helper, faq, report, fun, safety)',
  'เปลี่ยนโหมดการทำงานของบอท (helper, faq, report, fun, safety)',
  '/mode helper - Switch to helper mode
/mode faq - Switch to FAQ mode
/mode report - Switch to report mode
/mode fun - Switch to fun mode
/mode safety - Switch to safety mode',
  '/mode helper - เปลี่ยนเป็นโหมดช่วยเหลือ
/mode faq - เปลี่ยนเป็นโหมด FAQ
/mode report - เปลี่ยนเป็นโหมดรายงาน
/mode fun - เปลี่ยนเป็นโหมดสนุก
/mode safety - เปลี่ยนเป็นโหมดความปลอดภัย',
  true,
  false,
  true,
  true,
  70,
  'Settings'
) ON CONFLICT (command_key) DO NOTHING;

-- Get the command ID for aliases
DO $$
DECLARE
  cmd_id uuid;
BEGIN
  SELECT id INTO cmd_id FROM public.bot_commands WHERE command_key = 'mode';
  
  -- Insert aliases for /mode command
  INSERT INTO public.command_aliases (command_id, alias_text, language, is_primary, is_prefix, case_sensitive)
  VALUES 
    (cmd_id, '/mode', 'en', true, true, false),
    (cmd_id, '/m', 'en', false, true, false),
    (cmd_id, '/โหมด', 'th', false, true, false),
    (cmd_id, '/setmode', 'en', false, true, false)
  ON CONFLICT DO NOTHING;
END $$;