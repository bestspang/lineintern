-- ============================================================
-- Phase 1: Add Billable Hours System to work_sessions
-- ============================================================

-- Add billable hours tracking columns to work_sessions
ALTER TABLE work_sessions 
ADD COLUMN IF NOT EXISTS billable_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS hours_capped BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cap_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN work_sessions.billable_minutes IS 'Actual counted work minutes after applying limits (for salary calculation)';
COMMENT ON COLUMN work_sessions.hours_capped IS 'Whether work hours were capped due to max_work_hours_per_day limit';
COMMENT ON COLUMN work_sessions.cap_reason IS 'Reason for capping: max_hours_exceeded, below_minimum, etc.';

-- ============================================================
-- Phase 2: Add Minimum Work Hours System
-- ============================================================

-- Add minimum_work_hours setting to system_settings
INSERT INTO system_settings (setting_key, setting_value, category, description, created_at, updated_at)
VALUES (
  'minimum_work_hours',
  '{"hours": 1.0, "count_as_absent_if_below": true}'::jsonb,
  'attendance',
  'Minimum hours required to count as present. If below this, employee may be marked absent.',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Add optional minimum_work_hours override to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS minimum_work_hours NUMERIC DEFAULT NULL;

COMMENT ON COLUMN employees.minimum_work_hours IS 'Optional override for minimum work hours (overrides system setting)';

-- ============================================================
-- Phase 3: Create indexes for performance
-- ============================================================

-- Index for billable_minutes queries
CREATE INDEX IF NOT EXISTS idx_work_sessions_billable ON work_sessions(billable_minutes) WHERE billable_minutes IS NOT NULL;

-- Index for capped hours queries
CREATE INDEX IF NOT EXISTS idx_work_sessions_capped ON work_sessions(hours_capped) WHERE hours_capped = TRUE;