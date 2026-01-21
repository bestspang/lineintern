-- Add show_time column for check_in/check_out/both filtering
ALTER TABLE cute_quotes
ADD COLUMN IF NOT EXISTS show_time TEXT DEFAULT 'both';

-- Add bg_color column for custom background gradient
ALTER TABLE cute_quotes
ADD COLUMN IF NOT EXISTS bg_color TEXT DEFAULT 'pink-purple';

-- Update existing rows to have default values
UPDATE cute_quotes SET show_time = 'both' WHERE show_time IS NULL;
UPDATE cute_quotes SET bg_color = 'pink-purple' WHERE bg_color IS NULL;

-- Add constraint for show_time values
ALTER TABLE cute_quotes
ADD CONSTRAINT cute_quotes_show_time_check 
CHECK (show_time IN ('check_in', 'check_out', 'both'));