-- Phase 6: Add category column to bot_commands
ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Update categories for all commands
UPDATE bot_commands SET category = CASE command_key
  WHEN 'help' THEN 'general'
  WHEN 'ask' THEN 'general'
  WHEN 'summary' THEN 'conversation'
  WHEN 'find' THEN 'conversation'
  WHEN 'mentions' THEN 'conversation'
  WHEN 'todo' THEN 'work'
  WHEN 'remind' THEN 'work'
  WHEN 'tasks' THEN 'work'
  WHEN 'confirm_with_feedback' THEN 'work'
  WHEN 'progress_report' THEN 'work'
  WHEN 'list_reminders' THEN 'work'
  WHEN 'faq' THEN 'knowledge'
  WHEN 'train' THEN 'knowledge'
  WHEN 'report' THEN 'analytics'
  WHEN 'imagine' THEN 'creative'
  WHEN 'mode' THEN 'settings'
  WHEN 'status' THEN 'settings'
  ELSE 'general'
END;