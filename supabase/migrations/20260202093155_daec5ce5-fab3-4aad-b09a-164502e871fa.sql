-- Insert missing Attendance pages for ALL roles (9 roles × 8 pages = 72 records)
INSERT INTO webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role::public.app_role, 'Attendance', p.page_path, p.page_name, 
       CASE WHEN r.role IN ('owner', 'admin', 'hr') THEN true ELSE false END
FROM (
  VALUES 
    ('/attendance/birthdays', 'Birthdays'),
    ('/attendance/employees/:id', 'Employee Detail'),
    ('/attendance/employee-history/:id', 'Employee History'),
    ('/attendance/employee-settings/:id', 'Employee Settings'),
    ('/attendance/point-rules', 'Point Rules'),
    ('/attendance/schedules', 'Schedules'),
    ('/attendance/shift-templates', 'Shift Templates'),
    ('/attendance/work-history', 'Work History')
) AS p(page_path, page_name)
CROSS JOIN (
  SELECT DISTINCT role::text FROM webapp_page_config
) AS r(role)
ON CONFLICT DO NOTHING;