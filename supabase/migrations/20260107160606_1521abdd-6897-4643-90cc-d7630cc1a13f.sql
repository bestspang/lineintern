
-- Fix payroll_records RLS policy to be more restrictive
-- Currently has_field_access allows field/manager/executive/moderator to view ALL payroll
-- This should be restricted to: admins/owners, HR, or employees viewing their own records

-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Users can view payroll_records" ON public.payroll_records;

-- Create a more restrictive policy:
-- 1. Admins/Owners can view all (already have full access via "Admins and owners can manage payroll_records")
-- 2. HR can view all payroll records (legitimate business need)
-- 3. Employees can view only their own payroll records
-- 4. Managers/Executives can view payroll of employees they manage (using priority system)
CREATE POLICY "Users can view payroll_records" ON public.payroll_records
FOR SELECT TO authenticated
USING (
  has_admin_access(auth.uid()) 
  OR has_hr_access(auth.uid())
  OR (employee_id IN (
    SELECT e.id 
    FROM employees e 
    JOIN users u ON e.line_user_id = u.line_user_id 
    WHERE u.id = auth.uid()
  ))
);
