-- Add column for role-based command visibility
ALTER TABLE bot_commands 
ADD COLUMN IF NOT EXISTS min_role_priority INTEGER DEFAULT 0;

-- Add comment explaining the column
COMMENT ON COLUMN bot_commands.min_role_priority IS 
'Minimum employee_roles.priority required to see this command. 0 = all users, 5 = manager+, 8 = admin+, 10 = owner only';

-- Set memory commands to require admin+ (priority >= 8)
UPDATE bot_commands 
SET min_role_priority = 8 
WHERE category = 'memory';