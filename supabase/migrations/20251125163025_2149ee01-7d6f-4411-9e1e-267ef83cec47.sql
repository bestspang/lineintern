-- Add soft delete columns to branches
ALTER TABLE branches ADD COLUMN is_deleted BOOLEAN DEFAULT false;
ALTER TABLE branches ADD COLUMN deleted_at TIMESTAMPTZ;

-- Index for active branches query performance
CREATE INDEX idx_branches_active ON branches(is_deleted) WHERE is_deleted = false;

-- Function to soft delete branch with safety checks
CREATE OR REPLACE FUNCTION soft_delete_branch(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employee_count INTEGER;
  v_branch_name TEXT;
  v_logs_count INTEGER;
  v_summaries_count INTEGER;
BEGIN
  -- Check if branch exists
  SELECT name INTO v_branch_name FROM branches WHERE id = p_branch_id AND is_deleted = false;
  IF v_branch_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Branch not found or already deleted'
    );
  END IF;
  
  -- Check for active employees
  SELECT COUNT(*) INTO v_employee_count
  FROM employees
  WHERE branch_id = p_branch_id AND is_active = true;
  
  IF v_employee_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Cannot delete: %s active employee(s) in this branch. Please reassign or deactivate employees first.', v_employee_count),
      'employee_count', v_employee_count
    );
  END IF;
  
  -- Get stats for confirmation
  SELECT COUNT(*) INTO v_logs_count
  FROM attendance_logs
  WHERE branch_id = p_branch_id;
  
  SELECT COUNT(*) INTO v_summaries_count
  FROM daily_attendance_summaries
  WHERE branch_id = p_branch_id;
  
  -- Soft delete the branch
  UPDATE branches
  SET is_deleted = true, 
      deleted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_branch_id;
  
  -- Mark branch-specific attendance_settings as inactive
  UPDATE attendance_settings
  SET scope = 'branch_deleted',
      updated_at = NOW()
  WHERE branch_id = p_branch_id AND scope = 'branch';
  
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Branch "%s" deleted successfully', v_branch_name),
    'logs_count', v_logs_count,
    'summaries_count', v_summaries_count
  );
END;
$$;