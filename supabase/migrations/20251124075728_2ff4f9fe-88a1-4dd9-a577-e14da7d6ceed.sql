-- Phase 1: OT System Foundation - Database Schema

-- 1. Add new columns to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS salary_per_month DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS ot_rate_multiplier DECIMAL(3,2) DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS auto_ot_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS max_work_hours_per_day DECIMAL(4,2) DEFAULT 8.0,
ADD COLUMN IF NOT EXISTS ot_warning_minutes INTEGER DEFAULT 15;

-- 2. Add new columns to attendance_logs table
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(4,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_overtime BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS early_leave_request_id UUID,
ADD COLUMN IF NOT EXISTS overtime_request_id UUID,
ADD COLUMN IF NOT EXISTS approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected', 'auto_approved')) DEFAULT NULL;

-- 3. Create overtime_requests table
CREATE TABLE IF NOT EXISTS overtime_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_date DATE NOT NULL,
  estimated_hours DECIMAL(4,2) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by_admin_id UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  line_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create early_leave_requests table
CREATE TABLE IF NOT EXISTS early_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_log_id UUID REFERENCES attendance_logs(id),
  request_date DATE NOT NULL,
  actual_work_hours DECIMAL(4,2),
  required_work_hours DECIMAL(4,2),
  leave_reason TEXT NOT NULL,
  leave_type TEXT CHECK (leave_type IN ('sick', 'personal', 'vacation', 'emergency', 'other')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'timeout')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by_admin_id UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  timeout_at TIMESTAMPTZ,
  line_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create approval_logs table for audit trail
CREATE TABLE IF NOT EXISTS approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL CHECK (request_type IN ('overtime', 'early_leave')),
  request_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'timeout', 'auto_approved')),
  decision_method TEXT CHECK (decision_method IN ('line', 'webapp', 'auto')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_overtime_requests_employee ON overtime_requests(employee_id, request_date);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_status ON overtime_requests(status);
CREATE INDEX IF NOT EXISTS idx_early_leave_requests_employee ON early_leave_requests(employee_id, request_date);
CREATE INDEX IF NOT EXISTS idx_early_leave_requests_status ON early_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_logs_request ON approval_logs(request_type, request_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_ot ON attendance_logs(employee_id, is_overtime, server_time);

-- 7. Add foreign key constraints
ALTER TABLE attendance_logs 
ADD CONSTRAINT fk_early_leave_request FOREIGN KEY (early_leave_request_id) REFERENCES early_leave_requests(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_overtime_request FOREIGN KEY (overtime_request_id) REFERENCES overtime_requests(id) ON DELETE SET NULL;

-- 8. Enable RLS
ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_logs ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies
CREATE POLICY "Admins can manage overtime_requests"
ON overtime_requests FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view overtime_requests"
ON overtime_requests FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage early_leave_requests"
ON early_leave_requests FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view early_leave_requests"
ON early_leave_requests FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage approval_logs"
ON approval_logs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view approval_logs"
ON approval_logs FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 10. Create updated_at trigger for new tables
CREATE TRIGGER update_overtime_requests_updated_at
BEFORE UPDATE ON overtime_requests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_early_leave_requests_updated_at
BEFORE UPDATE ON early_leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 11. Create function to check if employee can check in
CREATE OR REPLACE FUNCTION can_employee_check_in(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_event TEXT;
BEGIN
  -- Get the most recent event (check-in or check-out) for today
  SELECT event_type INTO v_last_event
  FROM attendance_logs
  WHERE employee_id = p_employee_id
    AND DATE(server_time) = CURRENT_DATE
  ORDER BY server_time DESC
  LIMIT 1;
  
  -- Can check in if: no events today OR last event was check-out
  RETURN (v_last_event IS NULL OR v_last_event = 'check_out');
END;
$$;

-- 12. Create function to check if employee can check out
CREATE OR REPLACE FUNCTION can_employee_check_out(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_event TEXT;
BEGIN
  -- Get the most recent event for today
  SELECT event_type INTO v_last_event
  FROM attendance_logs
  WHERE employee_id = p_employee_id
    AND DATE(server_time) = CURRENT_DATE
  ORDER BY server_time DESC
  LIMIT 1;
  
  -- Can check out only if last event was check-in
  RETURN (v_last_event = 'check_in');
END;
$$;

-- 13. Create function to calculate work hours for an employee today
CREATE OR REPLACE FUNCTION get_work_hours_today(p_employee_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_hours DECIMAL := 0;
  v_check_in_time TIMESTAMPTZ;
  v_check_out_time TIMESTAMPTZ;
BEGIN
  -- Get all check-in and check-out pairs for today
  FOR v_check_in_time, v_check_out_time IN
    SELECT 
      ci.server_time as check_in,
      co.server_time as check_out
    FROM attendance_logs ci
    LEFT JOIN LATERAL (
      SELECT server_time
      FROM attendance_logs
      WHERE employee_id = ci.employee_id
        AND event_type = 'check_out'
        AND server_time > ci.server_time
        AND DATE(server_time) = CURRENT_DATE
      ORDER BY server_time ASC
      LIMIT 1
    ) co ON true
    WHERE ci.employee_id = p_employee_id
      AND ci.event_type = 'check_in'
      AND DATE(ci.server_time) = CURRENT_DATE
    ORDER BY ci.server_time
  LOOP
    IF v_check_out_time IS NOT NULL THEN
      v_total_hours := v_total_hours + EXTRACT(EPOCH FROM (v_check_out_time - v_check_in_time)) / 3600.0;
    END IF;
  END LOOP;
  
  RETURN ROUND(v_total_hours, 2);
END;
$$;