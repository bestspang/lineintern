-- Phase 1: Database Schema Updates for Hours-Based Attendance Enhancements

-- 1.1 เพิ่ม Fields ใน employees Table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS preferred_start_time TIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS auto_checkout_grace_period_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS enable_pattern_learning BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_second_checkin_reminder BOOLEAN DEFAULT true;

COMMENT ON COLUMN employees.preferred_start_time IS 'เวลาเริ่มงานที่แนะนำสำหรับ hours_based (ใช้สำหรับ soft reminder)';
COMMENT ON COLUMN employees.auto_checkout_grace_period_minutes IS 'ระยะเวลา grace period หลังครบชั่วโมงก่อน auto checkout (default 60 นาที)';
COMMENT ON COLUMN employees.enable_pattern_learning IS 'เปิดใช้งานการเรียนรู้รูปแบบการทำงาน';
COMMENT ON COLUMN employees.enable_second_checkin_reminder IS 'เปิดใช้งานการเตือน check-in รอบสองสำหรับ hours_based';

-- 1.2 สร้าง work_patterns Table (Pattern Learning)
CREATE TABLE IF NOT EXISTS work_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Pattern data
  typical_checkin_time TIME NOT NULL,
  typical_checkout_time TIME NOT NULL,
  typical_work_duration_minutes INTEGER NOT NULL,
  confidence_score DECIMAL(3,2) DEFAULT 0.50,
  
  -- Metadata
  pattern_type TEXT DEFAULT 'auto_learned',
  sample_size INTEGER DEFAULT 1,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_work_patterns_employee ON work_patterns(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_patterns_confidence ON work_patterns(confidence_score DESC);

COMMENT ON TABLE work_patterns IS 'เก็บรูปแบบการทำงานที่เรียนรู้จากพฤติกรรมพนักงาน';
COMMENT ON COLUMN work_patterns.confidence_score IS 'ความมั่นใจในรูปแบบ (0.00-1.00)';
COMMENT ON COLUMN work_patterns.pattern_type IS 'auto_learned | manual_set';

-- 1.3 สร้าง work_sessions Table (Multi-Shift Support)
CREATE TABLE IF NOT EXISTS work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  
  -- Session tracking
  session_number INTEGER NOT NULL DEFAULT 1,
  checkin_log_id UUID REFERENCES attendance_logs(id),
  checkout_log_id UUID REFERENCES attendance_logs(id),
  
  -- Time tracking
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  total_minutes INTEGER,
  break_minutes INTEGER DEFAULT 60,
  net_work_minutes INTEGER,
  
  -- Auto checkout tracking
  auto_checkout_grace_expires_at TIMESTAMPTZ,
  auto_checkout_warning_sent_at TIMESTAMPTZ,
  auto_checkout_performed BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(employee_id, work_date, session_number)
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_employee_date ON work_sessions(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_grace_expires ON work_sessions(auto_checkout_grace_expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_work_sessions_active ON work_sessions(employee_id, status) WHERE status = 'active';

COMMENT ON TABLE work_sessions IS 'ติดตามการทำงานแบบ multi-shift ต่อวัน';
COMMENT ON COLUMN work_sessions.status IS 'active | completed | auto_closed';
COMMENT ON COLUMN work_sessions.total_minutes IS 'เวลาทั้งหมดที่พนักงานอยู่ที่ทำงาน (รวมพัก)';
COMMENT ON COLUMN work_sessions.net_work_minutes IS 'เวลาทำงานสุทธิ (หักเวลาพักแล้ว)';

-- Enable RLS for new tables
ALTER TABLE work_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_patterns
CREATE POLICY "Admins can manage work_patterns"
  ON work_patterns FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view work_patterns"
  ON work_patterns FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for work_sessions
CREATE POLICY "Admins can manage work_sessions"
  ON work_sessions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view work_sessions"
  ON work_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);