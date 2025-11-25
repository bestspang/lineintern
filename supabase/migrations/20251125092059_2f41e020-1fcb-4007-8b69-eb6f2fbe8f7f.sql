-- Create employee_roles table
CREATE TABLE IF NOT EXISTS public.employee_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT UNIQUE NOT NULL,
  display_name_th TEXT NOT NULL,
  display_name_en TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create menu_items table
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_key TEXT UNIQUE NOT NULL,
  display_name_th TEXT NOT NULL,
  display_name_en TEXT NOT NULL,
  icon TEXT,
  action_type TEXT NOT NULL,
  action_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create role_menu_permissions table
CREATE TABLE IF NOT EXISTS public.role_menu_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES public.employee_roles(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role_id, menu_item_id)
);

-- Create employee_menu_tokens table
CREATE TABLE IF NOT EXISTS public.employee_menu_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add role_id to employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.employee_roles(id);

-- Enable RLS
ALTER TABLE public.employee_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_menu_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_menu_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view employee_roles"
ON public.employee_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage employee_roles"
ON public.employee_roles FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view menu_items"
ON public.menu_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage menu_items"
ON public.menu_items FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view role_menu_permissions"
ON public.role_menu_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage role_menu_permissions"
ON public.role_menu_permissions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage employee_menu_tokens"
ON public.employee_menu_tokens FOR ALL TO service_role USING (true);

-- Insert default roles
INSERT INTO public.employee_roles (role_key, display_name_th, display_name_en, priority, is_system) VALUES
  ('employee', 'พนักงาน', 'Employee', 0, true),
  ('field', 'พนักงานภาคสนาม', 'Field Staff', 1, true),
  ('manager', 'หัวหน้างาน', 'Manager', 5, true),
  ('admin', 'ผู้ดูแลระบบ', 'Admin', 8, true),
  ('owner', 'เจ้าของกิจการ', 'Owner', 10, true)
ON CONFLICT (role_key) DO NOTHING;

-- Insert default menu items
INSERT INTO public.menu_items (menu_key, display_name_th, display_name_en, icon, action_type, action_url, display_order) VALUES
  ('request_ot', 'ขอทำโอที', 'Request OT', 'Clock', 'page', '/attendance/overtime-requests', 1),
  ('request_leave', 'ขอลา', 'Request Leave', 'Calendar', 'page', '/attendance/leave-requests', 2),
  ('leave_balance', 'วันหยุดคงเหลือ', 'Leave Balance', 'CalendarCheck', 'page', '/attendance/leave-balance', 3),
  ('work_history', 'ประวัติการทำงาน', 'Work History', 'History', 'page', '/attendance/employee-history', 4),
  ('approve_ot', 'อนุมัติ OT', 'Approve OT', 'CheckCircle', 'page', '/attendance/overtime-management', 5),
  ('approve_leave', 'อนุมัติลา', 'Approve Leave', 'CheckSquare', 'page', '/attendance/early-leave-requests', 6),
  ('team_summary', 'สรุปทีม', 'Team Summary', 'Users', 'page', '/attendance/summaries', 7),
  ('all_employees', 'พนักงานทั้งหมด', 'All Employees', 'UserCog', 'page', '/attendance/employees', 8),
  ('system_settings', 'ตั้งค่าระบบ', 'System Settings', 'Settings', 'page', '/attendance/settings', 9)
ON CONFLICT (menu_key) DO NOTHING;

-- Assign menu items to roles
DO $$
DECLARE
  v_employee_role UUID;
  v_field_role UUID;
  v_manager_role UUID;
  v_admin_role UUID;
  v_owner_role UUID;
BEGIN
  -- Get role IDs
  SELECT id INTO v_employee_role FROM public.employee_roles WHERE role_key = 'employee';
  SELECT id INTO v_field_role FROM public.employee_roles WHERE role_key = 'field';
  SELECT id INTO v_manager_role FROM public.employee_roles WHERE role_key = 'manager';
  SELECT id INTO v_admin_role FROM public.employee_roles WHERE role_key = 'admin';
  SELECT id INTO v_owner_role FROM public.employee_roles WHERE role_key = 'owner';

  -- Employee role: basic menus
  INSERT INTO public.role_menu_permissions (role_id, menu_item_id)
  SELECT v_employee_role, id FROM public.menu_items 
  WHERE menu_key IN ('request_ot', 'request_leave', 'leave_balance', 'work_history')
  ON CONFLICT DO NOTHING;

  -- Field role: same as employee
  INSERT INTO public.role_menu_permissions (role_id, menu_item_id)
  SELECT v_field_role, id FROM public.menu_items 
  WHERE menu_key IN ('request_ot', 'request_leave', 'leave_balance', 'work_history')
  ON CONFLICT DO NOTHING;

  -- Manager role: all except system settings
  INSERT INTO public.role_menu_permissions (role_id, menu_item_id)
  SELECT v_manager_role, id FROM public.menu_items 
  WHERE menu_key IN ('request_ot', 'request_leave', 'leave_balance', 'work_history', 'approve_ot', 'approve_leave', 'team_summary', 'all_employees')
  ON CONFLICT DO NOTHING;

  -- Admin role: everything
  INSERT INTO public.role_menu_permissions (role_id, menu_item_id)
  SELECT v_admin_role, id FROM public.menu_items
  ON CONFLICT DO NOTHING;

  -- Owner role: everything
  INSERT INTO public.role_menu_permissions (role_id, menu_item_id)
  SELECT v_owner_role, id FROM public.menu_items
  ON CONFLICT DO NOTHING;
END $$;