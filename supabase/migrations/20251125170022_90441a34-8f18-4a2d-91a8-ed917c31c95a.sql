-- ===================================
-- PHASE 2-3: DUPLICATE PREVENTION & CONFIGURABLE SETTINGS (FIXED)
-- ===================================

-- 1. CONFIGURABLE SETTINGS: Create system_settings table for hardcoded values
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  is_editable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can read (for edge functions)
CREATE POLICY "Authenticated can read system_settings"
ON system_settings FOR SELECT
TO authenticated
USING (true);

-- Policy: Service role can manage all settings
CREATE POLICY "Service role can manage system_settings"
ON system_settings FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Insert default configurable settings
INSERT INTO system_settings (setting_key, setting_value, description, category, is_editable) VALUES
('app_url', 
 '{"url": "https://line-intern-bot.lovableproject.com"}', 
 'Application base URL for generating links',
 'general',
 true),
 
('reminder_intervals', 
 '{"intervals_hours": [24, 6, 1], "description": "Hours before shift start to send reminders"}',
 'Check-in reminder intervals in hours',
 'attendance',
 true),
 
('attendance_token_validity', 
 '{"minutes": 10}',
 'Default validity period for attendance tokens',
 'attendance',
 true),
 
('grace_period_auto_checkout', 
 '{"minutes": 30}',
 'Grace period after shift end before auto-checkout',
 'attendance',
 true),
 
('max_work_hours_default', 
 '{"hours": 8}',
 'Default maximum work hours per day',
 'attendance',
 true),
 
('rate_limit_attendance', 
 '{"max_requests": 10, "window_seconds": 60}',
 'Rate limiting for attendance submissions',
 'security',
 true),
 
('bot_retry_config', 
 '{"max_retries": 3, "initial_delay_ms": 1000, "max_delay_ms": 5000}',
 'Retry configuration for LINE bot API calls',
 'bot',
 true)
ON CONFLICT (setting_key) DO NOTHING;

-- 2. AUDIT LOG: Create comprehensive audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL, -- 'create', 'update', 'delete', 'approve', 'reject', etc.
  resource_type TEXT NOT NULL, -- 'employee', 'branch', 'attendance_log', 'overtime_request', etc.
  resource_id UUID,
  performed_by_user_id UUID, -- Admin who performed action
  performed_by_employee_id UUID, -- Employee record (if applicable)
  old_values JSONB,
  new_values JSONB,
  changes JSONB, -- Specific fields that changed
  reason TEXT, -- Optional reason for action
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB, -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performer ON audit_logs(performed_by_employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated can read audit logs
CREATE POLICY "Authenticated can read audit_logs"
ON audit_logs FOR SELECT
TO authenticated
USING (true);

-- Policy: Service role can insert audit logs
CREATE POLICY "Service role can insert audit_logs"
ON audit_logs FOR INSERT
TO service_role
WITH CHECK (true);

-- 3. HELPER FUNCTION: Log audit trail
CREATE OR REPLACE FUNCTION log_audit_trail(
  p_action_type TEXT,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_performed_by_employee_id UUID,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_audit_id UUID;
  v_changes JSONB;
BEGIN
  -- Calculate changes if both old and new values provided
  IF p_old_values IS NOT NULL AND p_new_values IS NOT NULL THEN
    v_changes := jsonb_object_agg(
      key,
      jsonb_build_object(
        'old', p_old_values->key,
        'new', p_new_values->key
      )
    )
    FROM jsonb_each(p_new_values)
    WHERE p_old_values->key IS DISTINCT FROM p_new_values->key;
  END IF;

  INSERT INTO audit_logs (
    action_type,
    resource_type,
    resource_id,
    performed_by_employee_id,
    old_values,
    new_values,
    changes,
    reason,
    metadata
  ) VALUES (
    p_action_type,
    p_resource_type,
    p_resource_id,
    p_performed_by_employee_id,
    p_old_values,
    p_new_values,
    v_changes,
    p_reason,
    p_metadata
  ) RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

-- 4. ADD TRIGGER TO LOG EMPLOYEE CHANGES
CREATE OR REPLACE FUNCTION audit_employee_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM log_audit_trail(
      'update',
      'employee',
      NEW.id,
      NULL, -- performed_by will be set by application
      row_to_json(OLD)::JSONB,
      row_to_json(NEW)::JSONB,
      NULL,
      jsonb_build_object('operation', 'auto_trigger')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_trail(
      'delete',
      'employee',
      OLD.id,
      NULL,
      row_to_json(OLD)::JSONB,
      NULL,
      NULL,
      jsonb_build_object('operation', 'auto_trigger')
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for employee changes
DROP TRIGGER IF EXISTS trigger_audit_employee_changes ON employees;
CREATE TRIGGER trigger_audit_employee_changes
AFTER UPDATE OR DELETE ON employees
FOR EACH ROW
EXECUTE FUNCTION audit_employee_changes();

-- 5. ENHANCED DUPLICATE PREVENTION TRIGGER
-- This replaces the existing prevent_rapid_attendance trigger with more robust logic
DROP TRIGGER IF EXISTS prevent_duplicate_attendance ON attendance_logs;

CREATE OR REPLACE FUNCTION enhanced_prevent_rapid_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_recent_count INTEGER;
BEGIN
  -- Check for exact duplicate within last 30 seconds
  SELECT COUNT(*) INTO v_recent_count
  FROM attendance_logs
  WHERE employee_id = NEW.employee_id
    AND event_type = NEW.event_type
    AND server_time > (NEW.server_time - INTERVAL '30 seconds')
    AND server_time < NEW.server_time
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
  
  IF v_recent_count > 0 THEN
    RAISE EXCEPTION 'Duplicate % detected within 30 seconds for employee %. Please wait before trying again.', 
      NEW.event_type, NEW.employee_id
      USING ERRCODE = '23505', 
            HINT = 'This prevents accidental duplicate submissions';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_duplicate_attendance
BEFORE INSERT ON attendance_logs
FOR EACH ROW
EXECUTE FUNCTION enhanced_prevent_rapid_attendance();

COMMENT ON TRIGGER prevent_duplicate_attendance ON attendance_logs IS 
'Prevents duplicate check-in/check-out submissions within 30 seconds';

-- 6. CREATE VIEW FOR EASY AUDIT LOG ACCESS
CREATE OR REPLACE VIEW audit_logs_detailed AS
SELECT 
  al.*,
  e.full_name as performed_by_name,
  e.code as performed_by_code
FROM audit_logs al
LEFT JOIN employees e ON e.id = al.performed_by_employee_id
ORDER BY al.created_at DESC;

COMMENT ON VIEW audit_logs_detailed IS 'Audit logs with employee details for easier querying';