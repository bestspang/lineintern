-- 1. Fix RLS Policy - ลบ policy เดิมที่ไม่ปลอดภัย
DROP POLICY IF EXISTS "Admins can manage quotes" ON cute_quotes;

-- 2. สร้าง Policy ใหม่ที่ปลอดภัย
-- ตรวจสอบจาก user_roles (dashboard admin) หรือ employees (LINE admin)
CREATE POLICY "Admins can manage quotes" ON cute_quotes
  FOR ALL
  USING (
    -- Dashboard admin users (from user_roles table)
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'owner')
    )
    OR
    -- LINE employee admins
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.line_user_id = (auth.jwt()->>'sub')
      AND employees.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- 3. เพิ่ม settings column ใน feature_flags (ถ้ายังไม่มี)
ALTER TABLE feature_flags
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- 4. Update cute_quotes_liveness flag ให้มี % settings
UPDATE feature_flags 
SET settings = jsonb_build_object(
  'check_in_chance', 100,
  'check_out_chance', 100
)
WHERE flag_key = 'cute_quotes_liveness';