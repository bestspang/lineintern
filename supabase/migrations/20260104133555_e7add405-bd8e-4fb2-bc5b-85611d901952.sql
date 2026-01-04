-- Add holiday_ot_rate_multiplier column to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS holiday_ot_rate_multiplier NUMERIC DEFAULT 2.0;

-- Add comment explaining the column
COMMENT ON COLUMN employees.holiday_ot_rate_multiplier IS 
  'OT rate multiplier for working on public holidays (default 2.0 = double pay per Thai labor law)';