-- Update menu_group in webapp_page_config to match sidebar structure

-- 1. Schedule & Leaves (8 pages)
UPDATE webapp_page_config SET menu_group = 'Schedule & Leaves'
WHERE page_path IN (
  '/attendance/shift-templates',
  '/attendance/schedules',
  '/attendance/holidays',
  '/attendance/birthdays',
  '/attendance/leave-balance',
  '/attendance/early-leave-requests',
  '/attendance/flexible-day-off-requests',
  '/attendance/flexible-day-off'
);

-- 2. Overtime (3 pages)
UPDATE webapp_page_config SET menu_group = 'Overtime'
WHERE page_path IN (
  '/attendance/overtime-requests',
  '/attendance/overtime-summary',
  '/attendance/overtime-management'
);

-- 3. Payroll (3 pages)
UPDATE webapp_page_config SET menu_group = 'Payroll'
WHERE page_path IN (
  '/attendance/payroll',
  '/attendance/payroll-ytd',
  '/attendance/work-history'
);

-- 4. Points & Rewards (5 pages)
UPDATE webapp_page_config SET menu_group = 'Points & Rewards'
WHERE page_path IN (
  '/attendance/happy-points',
  '/attendance/point-transactions',
  '/attendance/point-rules',
  '/attendance/rewards',
  '/attendance/redemption-approvals'
);

-- 5. Deposits (2 pages)
UPDATE webapp_page_config SET menu_group = 'Deposits'
WHERE page_path IN (
  '/attendance/deposits',
  '/attendance/deposit-settings'
);