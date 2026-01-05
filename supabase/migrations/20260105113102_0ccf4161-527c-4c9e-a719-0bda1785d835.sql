-- Fix: Update employees with complete data to 'active' status
UPDATE employees 
SET status = 'active' 
WHERE full_name IS NOT NULL 
  AND role_id IS NOT NULL 
  AND branch_id IS NOT NULL;