-- Phase 3: Fix timezone bug in can_employee_check_in and can_employee_check_out
-- Replace CURRENT_DATE (UTC) with Bangkok timezone

-- Fix can_employee_check_in
CREATE OR REPLACE FUNCTION public.can_employee_check_in(p_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_last_event TEXT;
  v_bangkok_today DATE;
BEGIN
  -- ✅ Use Bangkok timezone instead of UTC CURRENT_DATE
  v_bangkok_today := (NOW() AT TIME ZONE 'Asia/Bangkok')::DATE;
  
  -- Get the most recent event (check-in or check-out) for today in Bangkok timezone
  SELECT event_type INTO v_last_event
  FROM attendance_logs
  WHERE employee_id = p_employee_id
    AND (server_time AT TIME ZONE 'Asia/Bangkok')::DATE = v_bangkok_today
  ORDER BY server_time DESC
  LIMIT 1;
  
  -- Can check in if: no events today OR last event was check-out
  RETURN (v_last_event IS NULL OR v_last_event = 'check_out');
END;
$function$;

-- Fix can_employee_check_out
CREATE OR REPLACE FUNCTION public.can_employee_check_out(p_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_last_event TEXT;
  v_bangkok_today DATE;
BEGIN
  -- ✅ Use Bangkok timezone instead of UTC CURRENT_DATE
  v_bangkok_today := (NOW() AT TIME ZONE 'Asia/Bangkok')::DATE;
  
  -- Get the most recent event for today in Bangkok timezone
  SELECT event_type INTO v_last_event
  FROM attendance_logs
  WHERE employee_id = p_employee_id
    AND (server_time AT TIME ZONE 'Asia/Bangkok')::DATE = v_bangkok_today
  ORDER BY server_time DESC
  LIMIT 1;
  
  -- Can check out only if last event was check-in
  RETURN (v_last_event = 'check_in');
END;
$function$;