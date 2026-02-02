-- ============================================
-- Part 1: Manual Fix for Noey's Points (30 Jan 2026)
-- Current balance: 235, will be 295 after
-- ============================================

-- 1. เพิ่ม Attendance Adjustment สำหรับวันที่ 30 ม.ค.
INSERT INTO attendance_adjustments (
  employee_id,
  adjustment_date,
  override_status,
  reason,
  adjusted_by_user_id
) VALUES (
  'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af',
  '2026-01-30',
  'on_time',
  'Owner approved late start - ทำงานกะพิเศษถึงเที่ยงคืน',
  (SELECT id FROM auth.users LIMIT 1)
);

-- 2. เพิ่ม Punctuality Bonus ย้อนหลัง (balance: 235 -> 245)
INSERT INTO point_transactions (
  employee_id,
  transaction_type,
  category,
  amount,
  balance_after,
  description,
  metadata
) VALUES (
  'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af',
  'bonus',
  'attendance',
  10,
  245,
  '🕐 Punctuality bonus - 30 ม.ค. 69',
  '{"reference_date": "2026-01-30", "manual_adjustment": true}'
);

-- 3. เพิ่ม Streak Bonus 15 วัน (balance: 245 -> 295)
INSERT INTO point_transactions (
  employee_id,
  transaction_type,
  category,
  amount,
  balance_after,
  description,
  metadata
) VALUES (
  'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af',
  'bonus',
  'streak',
  50,
  295,
  '🔥 มาเช้าต่อเนื่อง 15 วัน! (30 ม.ค.)',
  '{"streak_days": 15, "manual_adjustment": true, "original_date": "2026-01-30"}'
);

-- 4. อัพเดท happy_points
UPDATE happy_points
SET 
  point_balance = 295,
  total_earned = 295,
  current_punctuality_streak = 4,
  longest_punctuality_streak = 15,
  updated_at = NOW()
WHERE employee_id = 'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af';

-- ============================================
-- Part 2: Schema Changes for Approved Late Start Feature
-- ============================================

-- Add columns to shift_assignments for approved late start
ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS approved_late_start BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_late_reason TEXT,
ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES auth.users(id);

-- Add comment for documentation
COMMENT ON COLUMN shift_assignments.approved_late_start IS 'When true, late check-in will still count as on-time for points and streak';
COMMENT ON COLUMN shift_assignments.approved_late_reason IS 'Reason why late start was approved';
COMMENT ON COLUMN shift_assignments.approved_by_user_id IS 'User who approved the late start';