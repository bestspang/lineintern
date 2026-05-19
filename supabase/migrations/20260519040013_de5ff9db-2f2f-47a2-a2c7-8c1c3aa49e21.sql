-- Sync webapp_page_config v2 — additive only
-- Insert missing rows for pages that exist in App.tsx but have zero
-- entries in webapp_page_config. ON CONFLICT DO NOTHING preserves any
-- existing row, so no permission a user has today is changed.
WITH new_pages(page_path, page_name, menu_group) AS (
  VALUES
    ('/overview',                       'Overview',           'Dashboard'),
    ('/branch-report',                  'Branch Report',      'Dashboard'),
    ('/portal-faq-admin',               'Portal FAQs',        'Content & Knowledge'),
    ('/attendance/ops-center',          'Daily Ops Center',   'Attendance'),
    ('/attendance/portal-performance',  'Portal Performance', 'Attendance'),
    ('/settings/reports',               'Reports',            'Configuration')
),
roles AS (
  SELECT unnest(ARRAY['admin','owner','hr','manager','executive','moderator','field','user','employee']::app_role[]) AS role
),
default_access AS (
  SELECT
    r.role,
    p.page_path,
    p.page_name,
    p.menu_group,
    CASE
      WHEN r.role IN ('admin','owner') THEN true
      WHEN r.role = 'hr'
        AND p.page_path IN ('/overview','/branch-report','/portal-faq-admin','/attendance/ops-center','/attendance/portal-performance') THEN true
      WHEN r.role = 'manager'
        AND p.page_path IN ('/overview','/branch-report','/attendance/ops-center','/attendance/portal-performance') THEN true
      WHEN r.role = 'executive'
        AND p.page_path = '/overview' THEN true
      ELSE false
    END AS can_access
  FROM roles r
  CROSS JOIN new_pages p
)
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT role, menu_group, page_path, page_name, can_access FROM default_access
ON CONFLICT DO NOTHING;