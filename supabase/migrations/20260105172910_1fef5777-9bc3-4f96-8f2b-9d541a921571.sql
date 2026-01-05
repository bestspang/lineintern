-- Add employee_type and primary_branch_id to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_type TEXT DEFAULT 'permanent';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS primary_branch_id UUID REFERENCES branches(id);

-- Add comment for employee_type values
COMMENT ON COLUMN employees.employee_type IS 'permanent = regular employee, temporary = daywork/emergency worker';

-- Backfill primary_branch_id with current branch_id for existing employees
UPDATE employees SET primary_branch_id = branch_id WHERE primary_branch_id IS NULL AND branch_id IS NOT NULL;

-- Add is_borrowed to shift_assignments table
ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS is_borrowed BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN shift_assignments.is_borrowed IS 'true = employee borrowed from another branch for this assignment';