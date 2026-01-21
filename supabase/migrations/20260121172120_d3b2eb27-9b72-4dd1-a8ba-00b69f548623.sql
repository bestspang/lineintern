-- Add command_aliases for cancel_ot command
-- This ensures /help displays the command properly

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/cancel-ot', 'en', true FROM bot_commands WHERE command_key = 'cancel_ot'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/cancelot', 'en', false FROM bot_commands WHERE command_key = 'cancel_ot'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/ยกเลิกot', 'th', true FROM bot_commands WHERE command_key = 'cancel_ot'
ON CONFLICT DO NOTHING;

INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/ยกเลิกโอที', 'th', false FROM bot_commands WHERE command_key = 'cancel_ot'
ON CONFLICT DO NOTHING;