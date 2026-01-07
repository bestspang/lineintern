-- Add new menu groups for reorganized navigation structure
INSERT INTO webapp_menu_config (role, menu_group, can_access)
SELECT role, menu_group, true
FROM (
  SELECT DISTINCT role FROM webapp_menu_config
) roles
CROSS JOIN (
  VALUES 
    ('Schedule & Leaves'),
    ('Overtime'),
    ('Payroll'),
    ('Points & Rewards'),
    ('Deposits'),
    ('Receipts')
) AS new_groups(menu_group)
WHERE NOT EXISTS (
  SELECT 1 FROM webapp_menu_config wmc 
  WHERE wmc.role = roles.role AND wmc.menu_group = new_groups.menu_group
);