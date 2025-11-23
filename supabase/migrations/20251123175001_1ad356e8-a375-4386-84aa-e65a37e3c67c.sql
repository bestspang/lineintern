-- เพิ่มฟิลด์กำหนดช่วงเวลาที่อนุญาตให้นับชั่วโมงสำหรับ hours_based
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS allowed_work_start_time TIME DEFAULT '06:00:00',
ADD COLUMN IF NOT EXISTS allowed_work_end_time TIME DEFAULT '20:00:00';

COMMENT ON COLUMN employees.allowed_work_start_time IS 'เวลาเริ่มต้นที่อนุญาตให้นับชั่วโมง (สำหรับ hours_based)';
COMMENT ON COLUMN employees.allowed_work_end_time IS 'เวลาสิ้นสุดที่อนุญาตให้นับชั่วโมง (สำหรับ hours_based)';