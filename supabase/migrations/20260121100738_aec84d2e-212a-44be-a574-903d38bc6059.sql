-- Add executive/owner tracking exclusion fields to employees
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS skip_attendance_tracking boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS exclude_from_points boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS employment_start_date date;

-- Add comments for documentation
COMMENT ON COLUMN public.employees.skip_attendance_tracking IS 'ไม่ต้อง track attendance สำหรับ owner/executive - จะนับเป็นมาตรงเวลาทุกวัน';
COMMENT ON COLUMN public.employees.exclude_from_points IS 'ไม่เข้าร่วมระบบ point และไม่แสดงบน leaderboard';
COMMENT ON COLUMN public.employees.employment_start_date IS 'วันที่เริ่มงาน - ใช้สำหรับกำหนดสถานะยังไม่เริ่มงาน';