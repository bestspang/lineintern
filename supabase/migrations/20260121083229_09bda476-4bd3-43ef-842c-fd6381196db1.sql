-- Add new daily response scoring rule
INSERT INTO point_rules (
  rule_key,
  name,
  name_th,
  description,
  category,
  points,
  is_active,
  timing_mode,
  conditions,
  notify_enabled,
  notify_message_template,
  notify_group,
  notify_dm
) VALUES (
  'response_daily_avg',
  'Daily Response Score',
  'คะแนนการตอบรายวัน',
  'Points awarded based on average response time throughout the day. Calculated once daily at 23:00.',
  'response',
  8,
  true,
  'daily',
  jsonb_build_object(
    'tiers', jsonb_build_array(
      jsonb_build_object('max_seconds', 300, 'points', 8, 'label', 'perfect'),
      jsonb_build_object('max_seconds', 600, 'points', 5, 'label', 'good'),
      jsonb_build_object('max_seconds', 1800, 'points', 3, 'label', 'ok'),
      jsonb_build_object('max_seconds', 999999, 'points', 1, 'label', 'slow')
    ),
    'min_responses', 1
  ),
  false,
  '🏆 คะแนนการตอบวันนี้: {{tier}} (+{{points}} pts)\n⏱️ เวลาตอบเฉลี่ย: {{avg_time}}s\n📊 จำนวนการตอบ: {{count}} ครั้ง',
  false,
  true
) ON CONFLICT (rule_key) DO UPDATE SET
  name = EXCLUDED.name,
  name_th = EXCLUDED.name_th,
  description = EXCLUDED.description,
  conditions = EXCLUDED.conditions,
  timing_mode = EXCLUDED.timing_mode;