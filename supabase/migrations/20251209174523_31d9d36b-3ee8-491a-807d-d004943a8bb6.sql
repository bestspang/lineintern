-- Phase 1: Add columns to response_analytics for work/outside hours response times
ALTER TABLE response_analytics 
ADD COLUMN IF NOT EXISTS avg_response_time_work_hours integer,
ADD COLUMN IF NOT EXISTS avg_response_time_outside_hours integer;

-- Add admin_line_group_id to attendance_settings for team health report destination
ALTER TABLE attendance_settings
ADD COLUMN IF NOT EXISTS admin_line_group_id text;

-- Add index for faster queries (using correct enum value 'human' instead of 'incoming')
CREATE INDEX IF NOT EXISTS idx_messages_sent_at_work_hours 
ON messages (sent_at, is_within_work_hours) 
WHERE direction = 'human';

CREATE INDEX IF NOT EXISTS idx_response_analytics_date 
ON response_analytics (date DESC);

CREATE INDEX IF NOT EXISTS idx_user_sentiment_history_date 
ON user_sentiment_history (date DESC);