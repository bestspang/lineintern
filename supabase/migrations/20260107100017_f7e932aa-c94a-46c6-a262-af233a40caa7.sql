-- ============================================
-- Phase 1: Fix attendance_logs RLS Policy (Critical)
-- ============================================

-- Drop existing policies that don't include has_field_access()
DROP POLICY IF EXISTS "Field users can view attendance logs" ON attendance_logs;
DROP POLICY IF EXISTS "Users can view own attendance logs" ON attendance_logs;

-- Create new unified policy with proper field access
CREATE POLICY "Field and admin users can view attendance logs"
ON attendance_logs
FOR SELECT
TO authenticated
USING (
  has_admin_access(auth.uid())
  OR has_field_access(auth.uid())
  OR employee_id IN (
    SELECT e.id FROM employees e 
    JOIN users u ON e.line_user_id = u.line_user_id 
    WHERE u.id = auth.uid()
  )
);

-- ============================================
-- Phase 2: Standardize RLS Policies for related tables
-- ============================================

-- work_schedules: Add field access
DROP POLICY IF EXISTS "Authenticated users can view work_schedules" ON work_schedules;
CREATE POLICY "Users can view work_schedules"
ON work_schedules FOR SELECT TO authenticated
USING (
  has_admin_access(auth.uid())
  OR has_field_access(auth.uid())
  OR employee_id IN (
    SELECT e.id FROM employees e 
    JOIN users u ON e.line_user_id = u.line_user_id 
    WHERE u.id = auth.uid()
  )
);

-- happy_points: Add field access
DROP POLICY IF EXISTS "Employees can view own happy_points" ON happy_points;
CREATE POLICY "Users can view happy_points"
ON happy_points FOR SELECT TO authenticated
USING (
  has_admin_access(auth.uid())
  OR has_field_access(auth.uid())
  OR employee_id IN (
    SELECT e.id FROM employees e 
    JOIN users u ON e.line_user_id = u.line_user_id 
    WHERE u.id = auth.uid()
  )
);

-- leave_balances: Change from 'true' to role-based
DROP POLICY IF EXISTS "Authenticated users can view leave_balances" ON leave_balances;
CREATE POLICY "Users can view leave_balances"
ON leave_balances FOR SELECT TO authenticated
USING (
  has_admin_access(auth.uid())
  OR has_field_access(auth.uid())
  OR employee_id IN (
    SELECT e.id FROM employees e 
    JOIN users u ON e.line_user_id = u.line_user_id 
    WHERE u.id = auth.uid()
  )
);

-- payroll_records: Add field access
DROP POLICY IF EXISTS "Users can view own payroll records" ON payroll_records;
CREATE POLICY "Users can view payroll_records"
ON payroll_records FOR SELECT TO authenticated
USING (
  has_admin_access(auth.uid())
  OR has_field_access(auth.uid())
  OR employee_id IN (
    SELECT e.id FROM employees e 
    JOIN users u ON e.line_user_id = u.line_user_id 
    WHERE u.id = auth.uid()
  )
);