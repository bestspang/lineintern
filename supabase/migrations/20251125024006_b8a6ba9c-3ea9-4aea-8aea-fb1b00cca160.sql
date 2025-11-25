-- Phase 1: Quick Fix - Enable photo requirement globally
UPDATE attendance_settings 
SET require_photo = true 
WHERE scope = 'global';

-- Phase 2: Add per-employee photo setting
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS require_photo BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN employees.require_photo IS 'Override photo requirement for this employee. NULL = use branch/global setting, true = always require, false = never require';

-- Update get_effective_attendance_settings function to check employee setting first
CREATE OR REPLACE FUNCTION public.get_effective_attendance_settings(p_employee_id uuid)
RETURNS TABLE(
  enable_attendance boolean,
  require_location boolean,
  require_photo boolean,
  token_validity_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(emp_settings.enable_attendance, branch_settings.enable_attendance, global_settings.enable_attendance, true) as enable_attendance,
    COALESCE(emp_settings.require_location, branch_settings.require_location, global_settings.require_location, true) as require_location,
    -- Check employee.require_photo first, then settings hierarchy
    COALESCE(
      e.require_photo,
      emp_settings.require_photo, 
      branch_settings.require_photo, 
      global_settings.require_photo, 
      false
    ) as require_photo,
    COALESCE(emp_settings.token_validity_minutes, branch_settings.token_validity_minutes, global_settings.token_validity_minutes, 10) as token_validity_minutes
  FROM employees e
  LEFT JOIN attendance_settings emp_settings ON emp_settings.scope = 'employee' AND emp_settings.employee_id = p_employee_id
  LEFT JOIN attendance_settings branch_settings ON branch_settings.scope = 'branch' AND branch_settings.branch_id = e.branch_id
  LEFT JOIN attendance_settings global_settings ON global_settings.scope = 'global'
  WHERE e.id = p_employee_id
  LIMIT 1;
END;
$function$;