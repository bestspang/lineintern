-- Phase 6: Create restore_branch function
CREATE OR REPLACE FUNCTION restore_branch(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_branch_name TEXT;
  v_deleted_at TIMESTAMPTZ;
BEGIN
  -- Check if branch exists and is deleted
  SELECT name, deleted_at INTO v_branch_name, v_deleted_at 
  FROM branches 
  WHERE id = p_branch_id AND is_deleted = true;
  
  IF v_branch_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Branch not found or not deleted'
    );
  END IF;
  
  -- Restore the branch
  UPDATE branches
  SET is_deleted = false, 
      deleted_at = NULL,
      updated_at = NOW()
  WHERE id = p_branch_id;
  
  -- Restore branch-specific attendance_settings
  UPDATE attendance_settings
  SET scope = 'branch',
      updated_at = NOW()
  WHERE branch_id = p_branch_id AND scope = 'branch_deleted';
  
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Branch "%s" restored successfully', v_branch_name),
    'deleted_at', v_deleted_at
  );
END;
$$;