-- Add scope column to daily_attendance_summaries
ALTER TABLE daily_attendance_summaries 
ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'per_branch';

-- Make branch_id nullable for all_branches summaries
ALTER TABLE daily_attendance_summaries 
ALTER COLUMN branch_id DROP NOT NULL;

-- Add updated_at column for tracking live updates
ALTER TABLE daily_attendance_summaries 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create unique index for all_branches scope (one per day)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summaries_all_branches 
ON daily_attendance_summaries (summary_date) 
WHERE scope = 'all_branches';

-- Update existing records to have scope = 'per_branch'
UPDATE daily_attendance_summaries 
SET scope = 'per_branch' 
WHERE scope IS NULL;