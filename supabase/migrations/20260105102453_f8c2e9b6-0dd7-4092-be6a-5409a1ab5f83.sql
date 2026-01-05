-- Create webapp_page_config table for page-level permission control
CREATE TABLE public.webapp_page_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role app_role NOT NULL,
  menu_group TEXT NOT NULL,
  page_path TEXT NOT NULL,
  page_name TEXT NOT NULL,
  can_access BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, page_path)
);

-- Enable RLS
ALTER TABLE public.webapp_page_config ENABLE ROW LEVEL SECURITY;

-- Admin/Owner can manage page config
CREATE POLICY "Admin and Owner can manage page config"
ON public.webapp_page_config FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);

-- All authenticated users can read page config
CREATE POLICY "Authenticated users can read page config"
ON public.webapp_page_config FOR SELECT
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_webapp_page_config_updated_at
BEFORE UPDATE ON public.webapp_page_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default page configurations for all roles
-- Dashboard group
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role, 'Dashboard', p.path, p.name, true
FROM (VALUES 
  ('owner'::app_role), ('admin'::app_role), ('executive'::app_role), 
  ('manager'::app_role), ('moderator'::app_role), ('user'::app_role), ('field'::app_role)
) AS r(role)
CROSS JOIN (VALUES
  ('/', 'Overview'),
  ('/health', 'Health Monitoring'),
  ('/config-validator', 'Config Validator')
) AS p(path, name);

-- Attendance group
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role, 'Attendance', p.path, p.name, true
FROM (VALUES 
  ('owner'::app_role), ('admin'::app_role), ('executive'::app_role), 
  ('manager'::app_role), ('moderator'::app_role), ('user'::app_role), ('field'::app_role)
) AS r(role)
CROSS JOIN (VALUES
  ('/attendance/dashboard', 'Dashboard'),
  ('/attendance/employees', 'Employees'),
  ('/attendance/logs', 'Attendance Logs'),
  ('/attendance/photos', 'Photos'),
  ('/attendance/branches', 'Branches'),
  ('/attendance/holidays', 'Holidays'),
  ('/attendance/roles', 'Roles'),
  ('/attendance/settings', 'Settings'),
  ('/attendance/payroll', 'Payroll'),
  ('/attendance/payroll-ytd', 'Payroll YTD'),
  ('/attendance/analytics', 'Analytics'),
  ('/attendance/summaries', 'Summaries'),
  ('/attendance/fraud-detection', 'Fraud Detection'),
  ('/attendance/reminder-logs', 'Reminder Logs'),
  ('/attendance/live-tracking', 'Live Tracking'),
  ('/attendance/overtime-management', 'OT Management'),
  ('/attendance/overtime-requests', 'OT Requests'),
  ('/attendance/overtime-summary', 'OT Summary'),
  ('/attendance/early-leave-requests', 'Early Leave Requests'),
  ('/attendance/flexible-day-off', 'Flexible Day Off'),
  ('/attendance/flexible-day-off-requests', 'Flexible Day Off Requests'),
  ('/attendance/leave-balance', 'Leave Balance'),
  ('/attendance/deposits', 'Deposits'),
  ('/attendance/deposit-settings', 'Deposit Settings'),
  ('/attendance/happy-points', 'Happy Points'),
  ('/attendance/rewards', 'Rewards'),
  ('/attendance/redemption-approvals', 'Redemption Approvals'),
  ('/attendance/point-transactions', 'Point Transactions')
) AS p(path, name);

-- Management group
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role, 'Management', p.path, p.name, true
FROM (VALUES 
  ('owner'::app_role), ('admin'::app_role), ('executive'::app_role), 
  ('manager'::app_role), ('moderator'::app_role), ('user'::app_role), ('field'::app_role)
) AS r(role)
CROSS JOIN (VALUES
  ('/groups', 'Groups'),
  ('/users', 'Users'),
  ('/tasks', 'Tasks'),
  ('/commands', 'Commands'),
  ('/alerts', 'Alerts'),
  ('/broadcast', 'Broadcast'),
  ('/direct-messages', 'Direct Messages'),
  ('/summaries', 'Summaries'),
  ('/reports', 'Reports'),
  ('/cron-jobs', 'Cron Jobs')
) AS p(path, name);

-- AI Features group
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role, 'AI Features', p.path, p.name, true
FROM (VALUES 
  ('owner'::app_role), ('admin'::app_role), ('executive'::app_role), 
  ('manager'::app_role), ('moderator'::app_role), ('user'::app_role), ('field'::app_role)
) AS r(role)
CROSS JOIN (VALUES
  ('/memory', 'Memory'),
  ('/memory-analytics', 'Memory Analytics'),
  ('/personality', 'Personality'),
  ('/analytics', 'Analytics')
) AS p(path, name);

-- Content & Knowledge group
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role, 'Content & Knowledge', p.path, p.name, true
FROM (VALUES 
  ('owner'::app_role), ('admin'::app_role), ('executive'::app_role), 
  ('manager'::app_role), ('moderator'::app_role), ('user'::app_role), ('field'::app_role)
) AS r(role)
CROSS JOIN (VALUES
  ('/faq-logs', 'FAQ Logs'),
  ('/knowledge-base', 'Knowledge Base'),
  ('/training', 'Training'),
  ('/safety-rules', 'Safety Rules')
) AS p(path, name);

-- Configuration group
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role, 'Configuration', p.path, p.name, true
FROM (VALUES 
  ('owner'::app_role), ('admin'::app_role), ('executive'::app_role), 
  ('manager'::app_role), ('moderator'::app_role), ('user'::app_role), ('field'::app_role)
) AS r(role)
CROSS JOIN (VALUES
  ('/settings', 'Settings'),
  ('/integrations', 'Integrations')
) AS p(path, name);

-- Monitoring & Tools group
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role, 'Monitoring & Tools', p.path, p.name, true
FROM (VALUES 
  ('owner'::app_role), ('admin'::app_role), ('executive'::app_role), 
  ('manager'::app_role), ('moderator'::app_role), ('user'::app_role), ('field'::app_role)
) AS r(role)
CROSS JOIN (VALUES
  ('/bot-logs', 'Bot Logs'),
  ('/test-bot', 'Test Bot')
) AS p(path, name);