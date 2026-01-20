-- Add timing_mode column to point_rules
ALTER TABLE point_rules
ADD COLUMN IF NOT EXISTS timing_mode TEXT DEFAULT 'immediate';

-- Add monthly_summary_enabled column
ALTER TABLE point_rules
ADD COLUMN IF NOT EXISTS monthly_summary_enabled BOOLEAN DEFAULT false;

-- Update existing streak rules with appropriate timing
UPDATE point_rules 
SET timing_mode = 'immediate'
WHERE rule_key = 'streak_weekly';

UPDATE point_rules 
SET timing_mode = 'end_of_month'
WHERE rule_key = 'streak_monthly';

-- Create monthly_summary rule if not exists
INSERT INTO point_rules (
  rule_key, 
  name, 
  name_th, 
  description_th, 
  category, 
  points, 
  conditions, 
  timing_mode, 
  notify_enabled, 
  notify_message_template, 
  notify_dm,
  notify_group,
  is_active
)
VALUES (
  'monthly_summary',
  'Monthly Points Summary',
  'สรุปแต้มประจำเดือน',
  'ส่งสรุปแต้มที่ได้รับทั้งเดือนให้พนักงานทุกสิ้นเดือน',
  'streak',
  0,
  '{}',
  'end_of_month',
  true,
  '📊 สรุปแต้มเดือน {month}
{name} ได้รับทั้งหมด {points} แต้ม
💰 แต้มสะสม: {balance} แต้ม',
  true,
  false,
  true
) ON CONFLICT (rule_key) DO NOTHING;