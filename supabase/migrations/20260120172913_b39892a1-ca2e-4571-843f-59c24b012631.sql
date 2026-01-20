-- 1. Drop the old category check constraint
ALTER TABLE point_rules DROP CONSTRAINT IF EXISTS point_rules_category_check;

-- 2. Add new category check constraint including all categories
ALTER TABLE point_rules ADD CONSTRAINT point_rules_category_check 
CHECK (category IN ('attendance', 'response', 'streak', 'health', 'penalty', 'summary'));

-- 3. Update monthly_summary to new 'summary' category and add conditions
UPDATE point_rules 
SET 
  category = 'summary',
  conditions = '{"include_categories": ["attendance", "response", "streak", "health"]}'::jsonb
WHERE rule_key = 'monthly_summary';

-- 4. Insert weekly_summary rule
INSERT INTO point_rules (
  rule_key, name, name_th, description, description_th,
  category, points, is_active, conditions,
  notify_enabled, notify_message_template, notify_group, notify_dm,
  timing_mode
) VALUES (
  'weekly_summary', 
  'Weekly Points Summary', 
  'สรุปแต้มประจำสัปดาห์',
  'Send weekly points summary to employees every Friday',
  'ส่งสรุปแต้มที่ได้รับทั้งสัปดาห์ให้พนักงานทุกวันศุกร์',
  'summary', 
  0, 
  true, 
  '{"include_categories": ["attendance", "response", "streak", "health"]}'::jsonb,
  true,
  '📊 สรุปแต้มประจำสัปดาห์\n{name} ได้รับทั้งหมด {points} แต้มในสัปดาห์นี้\n\n📋 รายละเอียด:\n• การเข้างาน: {attendance_points} แต้ม\n• การตอบกลับ: {response_points} แต้ม\n• ความต่อเนื่อง: {streak_points} แต้ม\n• สุขภาพ: {health_points} แต้ม\n\n💰 แต้มสะสม: {balance} แต้ม',
  false,
  true,
  'weekly_friday'
) ON CONFLICT (rule_key) DO NOTHING;