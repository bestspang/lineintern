-- =============================================
-- PHASE 1: ATTENDANCE SYSTEM DATABASE SCHEMA
-- =============================================

-- Create employees table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'office',
  line_user_id TEXT UNIQUE,
  branch_id UUID,
  announcement_group_line_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create branches table
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'office',
  line_group_id TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_meters INTEGER DEFAULT 200,
  photo_required BOOLEAN DEFAULT false,
  standard_start_time TIME,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add foreign key for employees.branch_id
ALTER TABLE employees ADD CONSTRAINT employees_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id);

-- Create attendance_tokens table
CREATE TABLE attendance_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('check_in', 'check_out')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX idx_attendance_tokens_status ON attendance_tokens(status, expires_at);
CREATE INDEX idx_attendance_tokens_employee ON attendance_tokens(employee_id, created_at DESC);

-- Create attendance_logs table
CREATE TABLE attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  branch_id UUID REFERENCES branches(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('check_in', 'check_out')),
  server_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_time TIMESTAMPTZ,
  timezone TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_url TEXT,
  device_info JSONB,
  source TEXT DEFAULT 'webapp',
  line_message_id TEXT,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_attendance_logs_employee_time ON attendance_logs(employee_id, server_time DESC);
CREATE INDEX idx_attendance_logs_branch_time ON attendance_logs(branch_id, server_time DESC);
CREATE INDEX idx_attendance_logs_flagged ON attendance_logs(is_flagged) WHERE is_flagged = true;

-- Create attendance_settings table
CREATE TABLE attendance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'branch', 'employee')),
  branch_id UUID REFERENCES branches(id),
  employee_id UUID REFERENCES employees(id),
  enable_attendance BOOLEAN DEFAULT true,
  require_location BOOLEAN DEFAULT true,
  require_photo BOOLEAN DEFAULT false,
  daily_summary_enabled BOOLEAN DEFAULT true,
  daily_summary_time TIME DEFAULT '18:00:00',
  time_zone TEXT DEFAULT 'Asia/Bangkok',
  standard_start_time TIME,
  token_validity_minutes INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scope, branch_id, employee_id)
);

-- Create daily_attendance_summaries table
CREATE TABLE daily_attendance_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  summary_date DATE NOT NULL,
  summary_text TEXT NOT NULL,
  total_employees INTEGER,
  checked_in INTEGER,
  checked_out INTEGER,
  late_count INTEGER,
  absent_count INTEGER,
  flagged_count INTEGER,
  line_message_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, summary_date)
);

-- Enable RLS on all tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attendance_summaries ENABLE ROW LEVEL SECURITY;

-- Admin policies (reuse existing has_role function)
CREATE POLICY "Admins can manage employees" ON employees FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage branches" ON branches FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage tokens" ON attendance_tokens FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage logs" ON attendance_logs FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage settings" ON attendance_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage summaries" ON daily_attendance_summaries FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view
CREATE POLICY "Authenticated users can view employees" ON employees FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can view branches" ON branches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can view logs" ON attendance_logs FOR SELECT USING (auth.uid() IS NOT NULL);

-- Function to get effective settings for an employee
CREATE OR REPLACE FUNCTION get_effective_attendance_settings(p_employee_id UUID)
RETURNS TABLE (
  enable_attendance BOOLEAN,
  require_location BOOLEAN,
  require_photo BOOLEAN,
  token_validity_minutes INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(emp_settings.enable_attendance, branch_settings.enable_attendance, global_settings.enable_attendance, true) as enable_attendance,
    COALESCE(emp_settings.require_location, branch_settings.require_location, global_settings.require_location, true) as require_location,
    COALESCE(emp_settings.require_photo, branch_settings.require_photo, global_settings.require_photo, false) as require_photo,
    COALESCE(emp_settings.token_validity_minutes, branch_settings.token_validity_minutes, global_settings.token_validity_minutes, 10) as token_validity_minutes
  FROM employees e
  LEFT JOIN attendance_settings emp_settings ON emp_settings.scope = 'employee' AND emp_settings.employee_id = p_employee_id
  LEFT JOIN attendance_settings branch_settings ON branch_settings.scope = 'branch' AND branch_settings.branch_id = e.branch_id
  LEFT JOIN attendance_settings global_settings ON global_settings.scope = 'global'
  WHERE e.id = p_employee_id
  LIMIT 1;
END;
$$;

-- Function to calculate distance between two points (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance_meters(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS INTEGER 
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  R CONSTANT DOUBLE PRECISION := 6371000;
  dLat DOUBLE PRECISION;
  dLon DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dLat := radians(lat2 - lat1);
  dLon := radians(lon2 - lon1);
  
  a := sin(dLat/2) * sin(dLat/2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dLon/2) * sin(dLon/2);
  
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  
  RETURN ROUND(R * c);
END;
$$;

-- Insert default global settings
INSERT INTO attendance_settings (scope, enable_attendance, require_location, require_photo, daily_summary_enabled, daily_summary_time, time_zone, token_validity_minutes)
VALUES ('global', true, true, false, true, '18:00:00', 'Asia/Bangkok', 10);