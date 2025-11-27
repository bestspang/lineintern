-- Add is_test_mode column for admin/owner testing bypass
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS is_test_mode boolean DEFAULT false;

COMMENT ON COLUMN employees.is_test_mode IS 
'Test mode for admin/owner - bypass all time/hours restrictions for testing purposes';