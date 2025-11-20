-- Phase 1: Work Reminder System - Database Schema

-- Create task_type enum
CREATE TYPE task_type AS ENUM ('todo', 'work_assignment', 'recurring');

-- Create work progress table for daily check-ins
CREATE TABLE public.work_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
  progress_text TEXT NOT NULL,
  progress_percentage INTEGER CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  quality_score TEXT CHECK (quality_score IN ('insufficient', 'adequate', 'detailed')),
  ai_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add task_type and work_metadata to tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS task_type task_type DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS work_metadata JSONB DEFAULT '{}'::jsonb;

-- Add comment explaining work_metadata structure
COMMENT ON COLUMN public.tasks.work_metadata IS 'JSON structure: { "assigner_user_id": "uuid", "assignee_user_id": "uuid", "check_in_count": 0, "last_check_in_at": "timestamp", "reminder_count": 0, "custom_reminder_hours": [24, 6, 1], "completion_notes": "text" }';

-- Create indexes for performance
CREATE INDEX idx_work_progress_task_id ON public.work_progress(task_id);
CREATE INDEX idx_work_progress_user_id ON public.work_progress(user_id);
CREATE INDEX idx_work_progress_check_in_date ON public.work_progress(check_in_date DESC);
CREATE INDEX idx_tasks_task_type ON public.tasks(task_type);
CREATE INDEX idx_tasks_work_metadata_gin ON public.tasks USING gin(work_metadata);
CREATE INDEX idx_tasks_due_at_status ON public.tasks(due_at, status) WHERE task_type = 'work_assignment';

-- Enable RLS on work_progress
ALTER TABLE public.work_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_progress
CREATE POLICY "Authenticated users can view work_progress"
  ON public.work_progress FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert work_progress"
  ON public.work_progress FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update work_progress"
  ON public.work_progress FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_work_progress_updated_at
  BEFORE UPDATE ON public.work_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add function to get pending work tasks for check-in
CREATE OR REPLACE FUNCTION public.get_pending_work_tasks()
RETURNS TABLE(
  task_id UUID,
  task_title TEXT,
  task_due_at TIMESTAMPTZ,
  assignee_user_id UUID,
  assignee_display_name TEXT,
  assignee_line_user_id TEXT,
  assigner_display_name TEXT,
  group_id UUID,
  group_line_id TEXT,
  days_remaining INTEGER,
  check_in_count INTEGER,
  last_check_in_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as task_id,
    t.title as task_title,
    t.due_at as task_due_at,
    (t.work_metadata->>'assignee_user_id')::UUID as assignee_user_id,
    u.display_name as assignee_display_name,
    u.line_user_id as assignee_line_user_id,
    assigner.display_name as assigner_display_name,
    t.group_id,
    g.line_group_id as group_line_id,
    EXTRACT(DAY FROM (t.due_at - now()))::INTEGER as days_remaining,
    COALESCE((t.work_metadata->>'check_in_count')::INTEGER, 0) as check_in_count,
    (SELECT MAX(wp.check_in_date) FROM work_progress wp WHERE wp.task_id = t.id) as last_check_in_date
  FROM tasks t
  JOIN users u ON u.id = (t.work_metadata->>'assignee_user_id')::UUID
  JOIN groups g ON g.id = t.group_id
  LEFT JOIN users assigner ON assigner.id = (t.work_metadata->>'assigner_user_id')::UUID
  WHERE 
    t.task_type = 'work_assignment'
    AND t.status = 'pending'
    AND t.due_at > now()
    AND (
      (SELECT MAX(wp.check_in_date) FROM work_progress wp WHERE wp.task_id = t.id) < CURRENT_DATE
      OR NOT EXISTS (SELECT 1 FROM work_progress wp WHERE wp.task_id = t.id)
    )
  ORDER BY t.due_at ASC;
END;
$$;

-- Add function to get overdue work tasks
CREATE OR REPLACE FUNCTION public.get_overdue_work_tasks()
RETURNS TABLE(
  task_id UUID,
  task_title TEXT,
  task_due_at TIMESTAMPTZ,
  assignee_user_id UUID,
  assignee_display_name TEXT,
  assignee_line_user_id TEXT,
  assigner_display_name TEXT,
  group_id UUID,
  group_line_id TEXT,
  days_overdue INTEGER,
  check_in_count INTEGER,
  last_progress_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as task_id,
    t.title as task_title,
    t.due_at as task_due_at,
    (t.work_metadata->>'assignee_user_id')::UUID as assignee_user_id,
    u.display_name as assignee_display_name,
    u.line_user_id as assignee_line_user_id,
    assigner.display_name as assigner_display_name,
    t.group_id,
    g.line_group_id as group_line_id,
    EXTRACT(DAY FROM (now() - t.due_at))::INTEGER as days_overdue,
    COALESCE((t.work_metadata->>'check_in_count')::INTEGER, 0) as check_in_count,
    (SELECT wp.progress_text FROM work_progress wp WHERE wp.task_id = t.id ORDER BY wp.created_at DESC LIMIT 1) as last_progress_text
  FROM tasks t
  JOIN users u ON u.id = (t.work_metadata->>'assignee_user_id')::UUID
  JOIN groups g ON g.id = t.group_id
  LEFT JOIN users assigner ON assigner.id = (t.work_metadata->>'assigner_user_id')::UUID
  WHERE 
    t.task_type = 'work_assignment'
    AND t.status = 'pending'
    AND t.due_at < now()
  ORDER BY t.due_at ASC;
END;
$$;