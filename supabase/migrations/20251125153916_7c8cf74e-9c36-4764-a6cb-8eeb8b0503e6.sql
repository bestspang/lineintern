-- =====================================================
-- Phase 1: Create Atomic Token Claim Function
-- =====================================================
-- This function prevents race conditions by atomically
-- claiming a token and returning its data in one transaction

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
  -- This ensures only ONE request can claim the token
  UPDATE attendance_tokens
  SET status = 'used', 
      used_at = NOW()
  WHERE id = p_token_id 
    AND status = 'pending'
    AND expires_at > NOW()
  RETURNING 
    id,
    employee_id,
    type,
    expires_at
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

-- =====================================================
-- Phase 4: Add Prevention Trigger
-- =====================================================
-- Prevent duplicate check-in/check-out within 30 seconds
-- This adds an extra safety layer against race conditions

CREATE OR REPLACE FUNCTION public.prevent_rapid_attendance()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Check for duplicate within last 30 seconds
  IF EXISTS (
    SELECT 1 
    FROM attendance_logs
    WHERE employee_id = NEW.employee_id
      AND event_type = NEW.event_type
      AND server_time > (NEW.server_time - INTERVAL '30 seconds')
      AND server_time < NEW.server_time
      AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Duplicate % submission detected within 30 seconds. Please wait before trying again.', NEW.event_type
      USING ERRCODE = '23505'; -- unique_violation error code
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_prevent_rapid_attendance ON attendance_logs;

CREATE TRIGGER trg_prevent_rapid_attendance
  BEFORE INSERT ON attendance_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_rapid_attendance();

-- Add helpful comment
COMMENT ON FUNCTION public.claim_attendance_token IS 
  'Atomically claims an attendance token to prevent race conditions. Returns NULL if token is already used or expired.';

COMMENT ON FUNCTION public.prevent_rapid_attendance IS 
  'Prevents duplicate attendance submissions within 30 seconds for the same employee and event type.';