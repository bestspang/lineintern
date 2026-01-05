-- Create function to check if user has field-level access (for WebApp users)
CREATE OR REPLACE FUNCTION public.has_field_access(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id
    AND role IN ('field', 'manager', 'executive', 'moderator')
  )
$$;

-- Update employees policy to allow field role access
DROP POLICY IF EXISTS "Users can view own employee profile" ON public.employees;
DROP POLICY IF EXISTS "Users can view employees" ON public.employees;

CREATE POLICY "Users can view employees"
ON public.employees FOR SELECT TO authenticated
USING (
  public.has_admin_access(auth.uid()) OR
  public.has_field_access(auth.uid()) OR
  line_user_id IN (SELECT line_user_id FROM public.users WHERE id = auth.uid())
);

-- Update attendance_logs policy for field access
DROP POLICY IF EXISTS "Users can view attendance logs" ON public.attendance_logs;

CREATE POLICY "Users can view attendance logs"
ON public.attendance_logs FOR SELECT TO authenticated
USING (
  public.has_admin_access(auth.uid()) OR
  public.has_field_access(auth.uid()) OR
  employee_id IN (
    SELECT id FROM public.employees 
    WHERE line_user_id IN (SELECT line_user_id FROM public.users WHERE id = auth.uid())
  )
);

-- Update early_leave_requests policy for field access
DROP POLICY IF EXISTS "Users can view early leave requests" ON public.early_leave_requests;

CREATE POLICY "Users can view early leave requests"
ON public.early_leave_requests FOR SELECT TO authenticated
USING (
  public.has_admin_access(auth.uid()) OR
  public.has_field_access(auth.uid()) OR
  employee_id IN (
    SELECT id FROM public.employees 
    WHERE line_user_id IN (SELECT line_user_id FROM public.users WHERE id = auth.uid())
  )
);

-- Update flexible_day_off_requests policy for field access
DROP POLICY IF EXISTS "Users can view flexible day off requests" ON public.flexible_day_off_requests;

CREATE POLICY "Users can view flexible day off requests"
ON public.flexible_day_off_requests FOR SELECT TO authenticated
USING (
  public.has_admin_access(auth.uid()) OR
  public.has_field_access(auth.uid()) OR
  employee_id IN (
    SELECT id FROM public.employees 
    WHERE line_user_id IN (SELECT line_user_id FROM public.users WHERE id = auth.uid())
  )
);

-- Update overtime_requests policy for field access
DROP POLICY IF EXISTS "Users can view overtime requests" ON public.overtime_requests;

CREATE POLICY "Users can view overtime requests"
ON public.overtime_requests FOR SELECT TO authenticated
USING (
  public.has_admin_access(auth.uid()) OR
  public.has_field_access(auth.uid()) OR
  employee_id IN (
    SELECT id FROM public.employees 
    WHERE line_user_id IN (SELECT line_user_id FROM public.users WHERE id = auth.uid())
  )
);

-- Update branches policy for field access
DROP POLICY IF EXISTS "Authenticated users can view branches" ON public.branches;
DROP POLICY IF EXISTS "Users can view branches" ON public.branches;

CREATE POLICY "Users can view branches"
ON public.branches FOR SELECT TO authenticated
USING (
  public.has_admin_access(auth.uid()) OR
  public.has_field_access(auth.uid())
);