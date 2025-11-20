-- Add mention_all field to tasks table to track if reminder should mention everyone
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS mention_all BOOLEAN DEFAULT FALSE;