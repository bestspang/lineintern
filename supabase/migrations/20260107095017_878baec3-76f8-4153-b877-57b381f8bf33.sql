-- ============================================
-- Add missing RLS SELECT policies for tables used by frontend
-- ============================================

-- 1. app_settings: เพิ่ม SELECT สำหรับ authenticated
CREATE POLICY "Authenticated users can view app_settings" 
ON app_settings 
FOR SELECT 
TO authenticated 
USING (true);

-- 2. attendance_settings: เพิ่ม SELECT สำหรับ authenticated
CREATE POLICY "Authenticated users can view attendance_settings" 
ON attendance_settings 
FOR SELECT 
TO authenticated 
USING (true);

-- 3. daily_attendance_summaries: เพิ่ม SELECT สำหรับ field+ users
CREATE POLICY "Field users can view daily_attendance_summaries" 
ON daily_attendance_summaries 
FOR SELECT 
TO authenticated 
USING (has_admin_access(auth.uid()) OR has_field_access(auth.uid()));

-- 4. broadcasts: เพิ่ม SELECT สำหรับ authenticated
CREATE POLICY "Authenticated users can view broadcasts" 
ON broadcasts 
FOR SELECT 
TO authenticated 
USING (true);

-- 5. broadcast_recipients: เพิ่ม SELECT สำหรับ admins
CREATE POLICY "Admins can view broadcast_recipients" 
ON broadcast_recipients 
FOR SELECT 
TO authenticated 
USING (has_admin_access(auth.uid()));

-- 6. recipient_groups: เพิ่ม SELECT สำหรับ authenticated
CREATE POLICY "Authenticated users can view recipient_groups" 
ON recipient_groups 
FOR SELECT 
TO authenticated 
USING (true);

-- 7. recipient_group_members: เพิ่ม SELECT สำหรับ admins
CREATE POLICY "Admins can view recipient_group_members" 
ON recipient_group_members 
FOR SELECT 
TO authenticated 
USING (has_admin_access(auth.uid()));

-- 8. summary_delivery_config: เพิ่ม SELECT สำหรับ authenticated
CREATE POLICY "Authenticated users can view summary_delivery_config" 
ON summary_delivery_config 
FOR SELECT 
TO authenticated 
USING (true);