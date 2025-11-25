-- Fix: Extension in Public Schema (move pgcrypto to extensions schema if present)
-- Also add missing indexes for performance

-- Add missing indexes for work_sessions
CREATE INDEX IF NOT EXISTS idx_work_sessions_grace_expires 
  ON work_sessions(auto_checkout_grace_expires_at) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_work_sessions_status_employee
  ON work_sessions(status, employee_id);

-- Add missing indexes for attendance_tokens
CREATE INDEX IF NOT EXISTS idx_attendance_tokens_status_expires
  ON attendance_tokens(status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_attendance_tokens_employee
  ON attendance_tokens(employee_id, expires_at);

-- Add indexes for tasks queries
CREATE INDEX IF NOT EXISTS idx_tasks_status_type_group
  ON tasks(status, task_type, group_id, due_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_work_metadata_gin
  ON tasks USING gin(work_metadata jsonb_path_ops);

-- Add index for messages queries
CREATE INDEX IF NOT EXISTS idx_messages_group_time
  ON messages(group_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_command_group
  ON messages(group_id, command_type)
  WHERE command_type IS NOT NULL;

-- Add index for memory_items
CREATE INDEX IF NOT EXISTS idx_memory_items_group_category
  ON memory_items(group_id, category, is_deleted)
  WHERE is_deleted = false;

-- Add index for alerts
CREATE INDEX IF NOT EXISTS idx_alerts_group_resolved
  ON alerts(group_id, resolved, created_at DESC);
