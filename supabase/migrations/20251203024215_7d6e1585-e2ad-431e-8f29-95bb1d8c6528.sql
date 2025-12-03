-- ลบ duplicate global settings (เก็บแค่ตัวล่าสุด)
DELETE FROM attendance_settings 
WHERE scope = 'global' 
AND id NOT IN (
  SELECT id FROM attendance_settings 
  WHERE scope = 'global' 
  ORDER BY created_at DESC 
  LIMIT 1
);

-- สร้าง unique partial index สำหรับ global settings (ป้องกัน duplicate)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_global_attendance_settings 
ON attendance_settings (scope) 
WHERE scope = 'global' AND branch_id IS NULL AND employee_id IS NULL;