-- 1. Create function to check if viewer can see target employee based on role priority
CREATE OR REPLACE FUNCTION public.can_view_employee_by_priority(
  viewer_user_id UUID, 
  target_employee_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_priority INTEGER;
  target_priority INTEGER;
BEGIN
  -- Admin/Owner can see everyone
  IF has_admin_access(viewer_user_id) THEN
    RETURN true;
  END IF;
  
  -- Get viewer's role priority from user_roles table
  SELECT 
    CASE ur.role::text
      WHEN 'owner' THEN 10
      WHEN 'admin' THEN 8
      WHEN 'manager' THEN 5
      WHEN 'executive' THEN 5
      WHEN 'field' THEN 1
      WHEN 'moderator' THEN 1
      ELSE 0
    END INTO viewer_priority
  FROM user_roles ur
  WHERE ur.user_id = viewer_user_id
  ORDER BY 
    CASE ur.role::text
      WHEN 'owner' THEN 10
      WHEN 'admin' THEN 8
      WHEN 'manager' THEN 5
      WHEN 'executive' THEN 5
      WHEN 'field' THEN 1
      WHEN 'moderator' THEN 1
      ELSE 0
    END DESC
  LIMIT 1;
  
  -- Default priority if not found
  IF viewer_priority IS NULL THEN
    viewer_priority := 0;
  END IF;
  
  -- Get target employee's priority from employee_roles table
  SELECT COALESCE(er.priority, 0) INTO target_priority
  FROM employees e
  LEFT JOIN employee_roles er ON e.role_id = er.id
  WHERE e.id = target_employee_id;
  
  -- Default to 0 if not found
  IF target_priority IS NULL THEN
    target_priority := 0;
  END IF;
  
  -- Can view if viewer has higher or equal priority
  RETURN viewer_priority >= target_priority;
END;
$$;

-- 2. Drop existing policy and create new role-based policy for attendance_logs
DROP POLICY IF EXISTS "Field and admin users can view attendance logs" ON attendance_logs;
DROP POLICY IF EXISTS "Role-based view attendance logs" ON attendance_logs;

CREATE POLICY "Role-based view attendance logs"
ON attendance_logs
FOR SELECT
TO authenticated
USING (
  has_admin_access(auth.uid())
  OR can_view_employee_by_priority(auth.uid(), employee_id)
  OR employee_id IN (
    SELECT e.id FROM employees e 
    JOIN users u ON e.line_user_id = u.line_user_id 
    WHERE u.id = auth.uid()
  )
);