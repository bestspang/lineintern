-- Add birth_date to employees table for birthday quotes
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Add special day columns to cute_quotes table
ALTER TABLE cute_quotes
ADD COLUMN IF NOT EXISTS special_day_type TEXT DEFAULT NULL;

ALTER TABLE cute_quotes
ADD COLUMN IF NOT EXISTS special_day_date DATE DEFAULT NULL;

ALTER TABLE cute_quotes
ADD COLUMN IF NOT EXISTS holiday_id UUID REFERENCES holidays(id) ON DELETE SET NULL;

-- Add check constraint for special_day_type
ALTER TABLE cute_quotes
ADD CONSTRAINT cute_quotes_special_day_type_check 
CHECK (special_day_type IS NULL OR special_day_type IN ('birthday', 'holiday', 'custom'));

-- Index for performance when filtering special day quotes
CREATE INDEX IF NOT EXISTS idx_cute_quotes_special_day 
ON cute_quotes(special_day_type, special_day_date);

CREATE INDEX IF NOT EXISTS idx_cute_quotes_holiday_id 
ON cute_quotes(holiday_id) WHERE holiday_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN cute_quotes.special_day_type IS 'NULL=regular quote, birthday=show on employee birthday, holiday=show on specific holiday, custom=show on specific date';
COMMENT ON COLUMN cute_quotes.special_day_date IS 'Used when special_day_type is custom - the specific date to show this quote';
COMMENT ON COLUMN cute_quotes.holiday_id IS 'Used when special_day_type is holiday - references the holiday to show this quote on';