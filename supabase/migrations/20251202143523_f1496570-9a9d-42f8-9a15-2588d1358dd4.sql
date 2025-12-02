
-- ============================================
-- Phase 1: Auto-create triggers for new employees
-- ============================================

-- 1.1 Trigger: Auto-create payroll settings when employee is created
CREATE OR REPLACE FUNCTION create_default_payroll_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO employee_payroll_settings (
    employee_id, 
    pay_type,
    has_social_security,
    has_transportation,
    has_withholding_tax,
    social_security_rate,
    social_security_cap,
    transportation_allowance,
    withholding_tax_rate
  ) VALUES (
    NEW.id,
    CASE WHEN NEW.working_time_type = 'hours_based' THEN 'hourly' ELSE 'salary' END,
    true,
    false,
    false,
    0.05,
    750,
    0,
    0
  ) ON CONFLICT (employee_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS create_payroll_settings_on_employee ON employees;
CREATE TRIGGER create_payroll_settings_on_employee
  AFTER INSERT ON employees
  FOR EACH ROW
  EXECUTE FUNCTION create_default_payroll_settings();

-- 1.2 Trigger: Auto-create work schedules (Mon-Fri 08:00-17:00)
CREATE OR REPLACE FUNCTION create_default_work_schedules()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO work_schedules (employee_id, day_of_week, is_working_day, start_time, end_time, expected_hours)
  SELECT NEW.id, day, (day BETWEEN 1 AND 5), '08:00:00'::time, '17:00:00'::time, 8
  FROM generate_series(0, 6) AS day
  ON CONFLICT (employee_id, day_of_week) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS create_work_schedules_on_employee ON employees;
CREATE TRIGGER create_work_schedules_on_employee
  AFTER INSERT ON employees
  FOR EACH ROW
  EXECUTE FUNCTION create_default_work_schedules();

-- ============================================
-- Phase 1.2: Backfill missing data for existing employees
-- ============================================

-- Backfill employee_payroll_settings for employees without settings
INSERT INTO employee_payroll_settings (
  employee_id,
  pay_type,
  has_social_security,
  has_transportation,
  has_withholding_tax,
  social_security_rate,
  social_security_cap,
  transportation_allowance,
  withholding_tax_rate
)
SELECT 
  e.id,
  CASE WHEN e.working_time_type = 'hours_based' THEN 'hourly' ELSE 'salary' END,
  true,
  false,
  false,
  0.05,
  750,
  0,
  0
FROM employees e
WHERE e.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM employee_payroll_settings eps WHERE eps.employee_id = e.id
  )
ON CONFLICT (employee_id) DO NOTHING;

-- Backfill work_schedules for employees without schedules (Mon-Fri 08:00-17:00)
INSERT INTO work_schedules (employee_id, day_of_week, is_working_day, start_time, end_time, expected_hours)
SELECT 
  e.id,
  day_num,
  (day_num BETWEEN 1 AND 5),
  '08:00:00'::time,
  '17:00:00'::time,
  8
FROM employees e
CROSS JOIN generate_series(0, 6) AS day_num
WHERE e.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM work_schedules ws 
    WHERE ws.employee_id = e.id AND ws.day_of_week = day_num
  )
ON CONFLICT (employee_id, day_of_week) DO NOTHING;
