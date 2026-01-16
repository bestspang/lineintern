-- Create has_management_access function if not exists
CREATE OR REPLACE FUNCTION public.has_management_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'owner', 'manager')
  )
$$;

-- Drop existing restrictive policies on employee_payroll_settings
DROP POLICY IF EXISTS "Admins and owners can manage employee_payroll_settings" ON employee_payroll_settings;
DROP POLICY IF EXISTS "Admin can manage employee_payroll_settings" ON employee_payroll_settings;

-- Create new policy that allows management roles
CREATE POLICY "Management can manage employee_payroll_settings" 
ON employee_payroll_settings
FOR ALL 
TO authenticated
USING (public.has_management_access(auth.uid()))
WITH CHECK (public.has_management_access(auth.uid()));

-- Also fix work_schedules table if it has similar issues
DROP POLICY IF EXISTS "Admins and owners can manage work_schedules" ON work_schedules;
DROP POLICY IF EXISTS "Admin can manage work_schedules" ON work_schedules;

CREATE POLICY "Management can manage work_schedules" 
ON work_schedules
FOR ALL 
TO authenticated
USING (public.has_management_access(auth.uid()))
WITH CHECK (public.has_management_access(auth.uid()));