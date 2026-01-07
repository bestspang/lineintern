-- ===============================================
-- Phase 1: Add HR Role to app_role enum
-- ===============================================
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'hr' AFTER 'manager';

-- ===============================================
-- Phase 2: Add HR to employee_roles table
-- ===============================================
INSERT INTO employee_roles (role_key, display_name_th, display_name_en, priority, is_system)
VALUES ('hr', 'ฝ่ายทรัพยากรบุคคล', 'Human Resources', 9, true)
ON CONFLICT (role_key) DO NOTHING;