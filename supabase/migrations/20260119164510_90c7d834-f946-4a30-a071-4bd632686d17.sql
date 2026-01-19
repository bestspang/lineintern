-- Create point_rules table for managing point conditions
CREATE TABLE public.point_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_th TEXT,
  description TEXT,
  description_th TEXT,
  category TEXT NOT NULL CHECK (category IN ('attendance', 'response', 'streak', 'health', 'penalty')),
  points INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  conditions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.point_rules ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Anyone can read point_rules"
ON public.point_rules
FOR SELECT
USING (true);

-- Allow admins to modify (using service role in edge functions)
CREATE POLICY "Service role can modify point_rules"
ON public.point_rules
FOR ALL
USING (true)
WITH CHECK (true);

-- Create updated_at trigger
CREATE TRIGGER update_point_rules_updated_at
BEFORE UPDATE ON public.point_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default rules
INSERT INTO public.point_rules (rule_key, name, name_th, description, description_th, category, points, conditions) VALUES
  ('punctuality', 'Punctuality Bonus', 'โบนัสตรงเวลา', 'Awarded for checking in on time or early', 'ได้รับเมื่อเข้างานตรงเวลาหรือก่อนเวลา', 'attendance', 10, '{"trigger": "check_in_on_time"}'),
  ('integrity', 'Integrity Bonus', 'โบนัสความซื่อสัตย์', 'Awarded for check-in with no fraud indicators', 'ได้รับเมื่อเช็คอินโดยไม่มีสัญญาณทุจริต', 'attendance', 5, '{"fraud_score": 0}'),
  ('response_perfect', 'Perfect Response', 'ตอบกลับสมบูรณ์แบบ', 'Quick and detailed response within 10 minutes', 'ตอบกลับรวดเร็วและละเอียดภายใน 10 นาที', 'response', 8, '{"response_time_max_seconds": 600, "min_length": 20}'),
  ('response_ack', 'Helpful Acknowledgment', 'ตอบรับรวดเร็ว', 'Quick acknowledgment within 10 minutes', 'รับทราบรวดเร็วภายใน 10 นาที', 'response', 3, '{"response_time_max_seconds": 600}'),
  ('response_late', 'Late but Sure', 'ช้าแต่ชัวร์', 'Detailed response after 1 hour', 'ตอบกลับละเอียดหลังจาก 1 ชั่วโมง', 'response', 2, '{"response_time_min_seconds": 3600, "min_length": 20}'),
  ('response_daily_cap', 'Daily Response Cap', 'จำกัดแต้มตอบกลับรายวัน', 'Maximum points earnable per day from responses', 'แต้มสูงสุดที่ได้รับต่อวันจากการตอบกลับ', 'response', 20, '{"type": "daily_cap"}'),
  ('streak_weekly', 'Weekly Streak Bonus', 'โบนัส Streak รายสัปดาห์', 'Bonus for 5+ consecutive punctual days', 'โบนัสสำหรับตรงเวลาติดต่อกัน 5 วันขึ้นไป', 'streak', 50, '{"min_streak": 5}'),
  ('streak_monthly', 'Monthly Streak Bonus', 'โบนัส Streak รายเดือน', 'Bonus for 20+ consecutive punctual days', 'โบนัสสำหรับตรงเวลาติดต่อกัน 20 วันขึ้นไป', 'streak', 100, '{"min_streak": 20}'),
  ('health_monthly', 'Monthly Health Bonus', 'โบนัสสุขภาพรายเดือน', 'Monthly health bonus for all employees', 'โบนัสสุขภาพรายเดือนสำหรับพนักงานทุกคน', 'health', 100, '{}'),
  ('sick_leave_no_cert', 'Sick Leave Penalty (No Certificate)', 'หักแต้มลาป่วย (ไม่มีใบรับรองแพทย์)', 'Deduction for sick leave without medical certificate', 'หักแต้มเมื่อลาป่วยโดยไม่มีใบรับรองแพทย์', 'penalty', -30, '{"leave_type": "sick", "has_certificate": false}'),
  ('sick_leave_with_cert', 'Sick Leave Penalty (With Certificate)', 'หักแต้มลาป่วย (มีใบรับรองแพทย์)', 'Reduced deduction for sick leave with medical certificate', 'หักแต้มน้อยลงเมื่อลาป่วยพร้อมใบรับรองแพทย์', 'penalty', -5, '{"leave_type": "sick", "has_certificate": true}');

-- Add index for faster lookups
CREATE INDEX idx_point_rules_category ON public.point_rules(category);
CREATE INDEX idx_point_rules_rule_key ON public.point_rules(rule_key);
CREATE INDEX idx_point_rules_is_active ON public.point_rules(is_active);