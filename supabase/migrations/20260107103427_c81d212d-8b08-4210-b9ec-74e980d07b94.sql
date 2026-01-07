-- ===============================================
-- Phase 3: Create has_hr_access function
-- HR, admin, and owner can access HR data
-- ===============================================
CREATE OR REPLACE FUNCTION public.has_hr_access(_user_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role IN ('hr', 'admin', 'owner')
  )
$$;

-- ===============================================
-- Phase 4: Update can_view_employee_by_priority to include HR
-- HR (priority mapping 9) can see everyone including owner
-- ===============================================
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
  
  -- HR can see everyone (including owner for HR purposes)
  IF has_hr_access(viewer_user_id) THEN
    RETURN true;
  END IF;
  
  -- Get viewer's role priority from user_roles table
  SELECT 
    CASE ur.role::text
      WHEN 'owner' THEN 10
      WHEN 'hr' THEN 9
      WHEN 'admin' THEN 8
      WHEN 'executive' THEN 5
      WHEN 'manager' THEN 5
      WHEN 'field' THEN 1
      WHEN 'moderator' THEN 1
      ELSE 0
    END INTO viewer_priority
  FROM user_roles ur
  WHERE ur.user_id = viewer_user_id
  ORDER BY 
    CASE ur.role::text
      WHEN 'owner' THEN 10
      WHEN 'hr' THEN 9
      WHEN 'admin' THEN 8
      WHEN 'executive' THEN 5
      WHEN 'manager' THEN 5
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

-- ===============================================
-- Phase 5: Update RLS for employees table
-- ===============================================
DROP POLICY IF EXISTS "Users can view employees" ON employees;
DROP POLICY IF EXISTS "Field and admin users can view employees" ON employees;
DROP POLICY IF EXISTS "Role-based view employees" ON employees;

CREATE POLICY "Role-based view employees"
ON employees
FOR SELECT
TO authenticated
USING (
  has_admin_access(auth.uid())
  OR can_view_employee_by_priority(auth.uid(), id)
  OR line_user_id IN (SELECT line_user_id FROM users WHERE id = auth.uid())
);

-- ===============================================
-- Phase 6: Update RLS for shift_assignments table
-- ===============================================
DROP POLICY IF EXISTS "Anyone can read shift assignments" ON shift_assignments;
DROP POLICY IF EXISTS "Role-based view shift assignments" ON shift_assignments;

CREATE POLICY "Role-based view shift assignments"
ON shift_assignments
FOR SELECT
TO authenticated
USING (
  has_admin_access(auth.uid())
  OR can_view_employee_by_priority(auth.uid(), employee_id)
);

-- ===============================================
-- Phase 7: Add HR menu access in webapp_menu_config
-- ===============================================
INSERT INTO webapp_menu_config (role, menu_group, can_access)
VALUES 
  ('hr', 'dashboard', true),
  ('hr', 'attendance', true),
  ('hr', 'employees', true),
  ('hr', 'schedules', true),
  ('hr', 'payroll', true),
  ('hr', 'leaves', true),
  ('hr', 'reports', true),
  ('hr', 'settings', false)
ON CONFLICT (role, menu_group) DO UPDATE SET can_access = EXCLUDED.can_access;