-- Fix ambiguous column reference in claim_attendance_token function
CREATE OR REPLACE FUNCTION public.claim_attendance_token(p_token_id UUID)
RETURNS TABLE(
  token_id UUID,
  employee_id UUID,
  token_type TEXT,
  expires_at TIMESTAMPTZ,
  employee_data JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token RECORD;
BEGIN
  -- Atomic: UPDATE + RETURN in single operation
  -- Use table alias "t" to explicitly reference table columns
  UPDATE attendance_tokens t
  SET status = 'used', 
      used_at = NOW()
  WHERE t.id = p_token_id 
    AND t.status = 'pending'
    AND t.expires_at > NOW()  -- Explicitly use t.expires_at to avoid ambiguity
  RETURNING 
    t.id,
    t.employee_id,
    t.type,
    t.expires_at
  INTO v_token;
  
  -- If no token was updated, it's already used or expired
  IF v_token.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get employee data
  RETURN QUERY
  SELECT 
    v_token.id AS token_id,
    v_token.employee_id,
    v_token.type AS token_type,
    v_token.expires_at,
    row_to_json(e.*)::JSONB AS employee_data
  FROM employees e
  WHERE e.id = v_token.employee_id;
END;
$$;