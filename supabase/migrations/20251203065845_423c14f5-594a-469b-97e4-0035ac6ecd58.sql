-- สร้าง Trigger สำหรับ auto-create leave balance เมื่อเพิ่ม employee ใหม่
CREATE TRIGGER create_leave_balance_on_employee_insert
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.create_initial_leave_balance();

-- Backfill leave_balances สำหรับ employees ที่มีอยู่แล้วในปี 2025
INSERT INTO public.leave_balances (employee_id, leave_year, vacation_days_total, sick_days_total, personal_days_total, vacation_days_used, sick_days_used, personal_days_used)
SELECT 
  id, 
  2025,
  10, -- default vacation
  30, -- default sick
  3,  -- default personal
  0,
  0,
  0
FROM public.employees 
WHERE is_active = true
  AND id NOT IN (SELECT employee_id FROM public.leave_balances WHERE leave_year = 2025)
ON CONFLICT (employee_id, leave_year) DO NOTHING;