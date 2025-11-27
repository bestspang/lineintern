-- ========================================
-- Phase 1-4: Hours-Based Enhancement Migration
-- ========================================

-- Phase 1: Time Window for Hours-Based Check-in
-- Add columns to employees table for check-in time window
ALTER TABLE employees ADD COLUMN IF NOT EXISTS earliest_checkin_time TIME DEFAULT '06:00:00';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS latest_checkin_time TIME DEFAULT '11:00:00';

-- Phase 2: Set minimum_work_hours for hours_based employees
-- minimum_work_hours = hours_per_day + break_hours (for hours_based employees)
UPDATE employees 
SET minimum_work_hours = COALESCE(hours_per_day, 8) + COALESCE(break_hours, 1)
WHERE working_time_type = 'hours_based' 
  AND (minimum_work_hours IS NULL OR minimum_work_hours = 0);

-- Phase 4: Missing Employee Detection columns
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS missing_warning_sent_at TIMESTAMPTZ;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMPTZ;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS is_suspicious_absence BOOLEAN DEFAULT FALSE;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS missing_check_count INTEGER DEFAULT 0;

-- Add index for faster missing employee queries
CREATE INDEX IF NOT EXISTS idx_work_sessions_active_missing 
ON work_sessions(status, is_suspicious_absence) 
WHERE status = 'active';

-- Comments for documentation
COMMENT ON COLUMN employees.earliest_checkin_time IS 'Earliest time hours_based employees can check in (default 06:00)';
COMMENT ON COLUMN employees.latest_checkin_time IS 'Latest time hours_based employees can check in (default 11:00)';
COMMENT ON COLUMN work_sessions.missing_warning_sent_at IS 'When first missing warning was sent to employee';
COMMENT ON COLUMN work_sessions.admin_notified_at IS 'When admin was notified about potential missing employee';
COMMENT ON COLUMN work_sessions.is_suspicious_absence IS 'Flagged as potential unauthorized absence';
COMMENT ON COLUMN work_sessions.missing_check_count IS 'Number of missing checks performed';