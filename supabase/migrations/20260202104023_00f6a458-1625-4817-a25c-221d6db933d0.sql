-- Add auth_user_id column to link webapp users with employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_employees_auth_user_id ON employees(auth_user_id);

-- Link mefonn (khwanchanok.p@goodchoose.com) with their webapp user
UPDATE employees 
SET auth_user_id = '2b67767d-67cb-4f02-bf9f-e0f166cc7a18'
WHERE full_name = 'mefonn';