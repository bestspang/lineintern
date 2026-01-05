-- Fix Security Issue 1: Users table publicly readable
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can manage users" ON public.users;

-- Fix Security Issue 2: Attendance logs accessible to all field users
-- Drop the overly permissive policy and replace with proper scoping
DROP POLICY IF EXISTS "Users can view attendance logs" ON public.attendance_logs;

-- The existing "Users can view own attendance logs" policy is correct:
-- It allows viewing only own logs OR admin access
-- We keep that one and don't add a new all-encompassing field access policy

-- Recreate a properly scoped field access policy for attendance_logs
-- Field users can view attendance logs for employees they manage OR their own
CREATE POLICY "Field users can view attendance logs"
ON public.attendance_logs
FOR SELECT
USING (
  has_admin_access(auth.uid())
  OR 
  employee_id IN (
    SELECT e.id 
    FROM employees e 
    JOIN users u ON e.line_user_id = u.line_user_id 
    WHERE u.id = auth.uid()
  )
);