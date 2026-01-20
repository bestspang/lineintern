-- Add notification columns to point_rules table
ALTER TABLE point_rules
ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notify_message_template TEXT,
ADD COLUMN IF NOT EXISTS notify_group BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notify_dm BOOLEAN DEFAULT false;

-- Set default notification templates for streak rules
UPDATE point_rules 
SET notify_enabled = true,
    notify_message_template = '🎉 {name} น่ารักที่สุดเลย! เข้างานตรงเวลาครบ {streak} วันติด เอาไปเลย {points} แต้ม!',
    notify_group = true,
    notify_dm = false
WHERE rule_key = 'streak_weekly';

UPDATE point_rules 
SET notify_enabled = true,
    notify_message_template = '🏆 ยอดเยี่ยมมาก! {name} เข้างานตรงเวลาครบ {streak} วัน รับ {points} แต้ม!',
    notify_group = true,
    notify_dm = false
WHERE rule_key = 'streak_monthly';

-- Add comment for documentation
COMMENT ON COLUMN point_rules.notify_enabled IS 'Whether to send LINE notification when points are awarded for this rule';
COMMENT ON COLUMN point_rules.notify_message_template IS 'Template for notification message. Variables: {name}, {points}, {streak}, {balance}';
COMMENT ON COLUMN point_rules.notify_group IS 'Send notification to the employee announcement group';
COMMENT ON COLUMN point_rules.notify_dm IS 'Send notification as direct message to employee';