-- Add recurring task support to tasks table
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_pattern text,
  ADD COLUMN IF NOT EXISTS recurrence_interval integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_day_of_week integer,
  ADD COLUMN IF NOT EXISTS recurrence_day_of_month integer,
  ADD COLUMN IF NOT EXISTS recurrence_time text,
  ADD COLUMN IF NOT EXISTS recurrence_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS next_occurrence_at timestamptz;

-- Create indexes for recurring task queries
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks(is_recurring, next_occurrence_at) 
WHERE is_recurring = true AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);

-- Add comment for clarity
COMMENT ON COLUMN tasks.is_recurring IS 'True for recurring task templates';
COMMENT ON COLUMN tasks.recurrence_pattern IS 'daily, weekly, monthly, or none';
COMMENT ON COLUMN tasks.recurrence_time IS 'HH:MM format in Bangkok time';
COMMENT ON COLUMN tasks.parent_task_id IS 'Links to recurring template that created this instance';
COMMENT ON COLUMN tasks.next_occurrence_at IS 'When next instance should be created for recurring tasks';