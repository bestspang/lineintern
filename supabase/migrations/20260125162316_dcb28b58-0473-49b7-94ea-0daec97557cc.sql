-- Phase 6: Add admin_notes column to work_sessions for auto-close reason tracking
ALTER TABLE work_sessions 
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Add descriptive comment
COMMENT ON COLUMN work_sessions.admin_notes IS 'Notes from admin or system when closing sessions (e.g., auto-cleanup reason)';