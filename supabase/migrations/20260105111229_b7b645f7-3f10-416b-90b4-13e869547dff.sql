-- Add status column to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'new' 
CHECK (status IN ('new', 'active', 'inactive'));

-- Update existing employees to active (they already have data)
UPDATE employees SET status = 'active' WHERE status IS NULL;