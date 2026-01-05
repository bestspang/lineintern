-- =============================================
-- SHIFT SCHEDULING SYSTEM - Database Schema
-- =============================================

-- 1. Shift Templates - รูปแบบกะมาตรฐาน
CREATE TABLE public.shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_hours NUMERIC(3,1) DEFAULT 1,
  color TEXT DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Weekly Schedules - ตารางสัปดาห์
CREATE TABLE public.weekly_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  week_start_date DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID,
  published_at TIMESTAMPTZ,
  published_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, week_start_date)
);

-- 3. Shift Assignments - การจัดกะรายวัน
CREATE TABLE public.shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.weekly_schedules(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  work_date DATE NOT NULL,
  shift_template_id UUID REFERENCES public.shift_templates(id) ON DELETE SET NULL,
  custom_start_time TIME,
  custom_end_time TIME,
  is_day_off BOOLEAN DEFAULT false,
  day_off_type TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(schedule_id, employee_id, work_date)
);

-- 4. Schedule Change Logs - ติดตามการเปลี่ยนแปลง
CREATE TABLE public.schedule_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.weekly_schedules(id) ON DELETE CASCADE NOT NULL,
  assignment_id UUID REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  work_date DATE,
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted', 'day_off', 'swap')),
  old_value JSONB,
  new_value JSONB,
  changed_by UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES for Performance
-- =============================================
CREATE INDEX idx_shift_templates_branch ON public.shift_templates(branch_id) WHERE is_active = true;
CREATE INDEX idx_weekly_schedules_branch_week ON public.weekly_schedules(branch_id, week_start_date);
CREATE INDEX idx_weekly_schedules_status ON public.weekly_schedules(status);
CREATE INDEX idx_shift_assignments_schedule ON public.shift_assignments(schedule_id);
CREATE INDEX idx_shift_assignments_employee_date ON public.shift_assignments(employee_id, work_date);
CREATE INDEX idx_shift_assignments_date ON public.shift_assignments(work_date);
CREATE INDEX idx_schedule_change_logs_schedule ON public.schedule_change_logs(schedule_id);

-- =============================================
-- RLS Policies
-- =============================================
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_change_logs ENABLE ROW LEVEL SECURITY;

-- Shift Templates: All authenticated users can read
CREATE POLICY "Anyone can read active shift templates"
  ON public.shift_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage shift templates"
  ON public.shift_templates FOR ALL
  USING (true)
  WITH CHECK (true);

-- Weekly Schedules: All authenticated users can read
CREATE POLICY "Anyone can read weekly schedules"
  ON public.weekly_schedules FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage weekly schedules"
  ON public.weekly_schedules FOR ALL
  USING (true)
  WITH CHECK (true);

-- Shift Assignments: All authenticated users can read
CREATE POLICY "Anyone can read shift assignments"
  ON public.shift_assignments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage shift assignments"
  ON public.shift_assignments FOR ALL
  USING (true)
  WITH CHECK (true);

-- Schedule Change Logs: All authenticated users can read
CREATE POLICY "Anyone can read schedule change logs"
  ON public.schedule_change_logs FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert schedule change logs"
  ON public.schedule_change_logs FOR INSERT
  WITH CHECK (true);

-- =============================================
-- Updated_at Trigger
-- =============================================
CREATE OR REPLACE FUNCTION update_shift_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_shift_templates_updated_at
  BEFORE UPDATE ON public.shift_templates
  FOR EACH ROW EXECUTE FUNCTION update_shift_updated_at();

CREATE TRIGGER trigger_weekly_schedules_updated_at
  BEFORE UPDATE ON public.weekly_schedules
  FOR EACH ROW EXECUTE FUNCTION update_shift_updated_at();

CREATE TRIGGER trigger_shift_assignments_updated_at
  BEFORE UPDATE ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION update_shift_updated_at();

-- =============================================
-- Default Shift Templates (will be created per branch)
-- =============================================
-- Note: These will be created via UI, no default data needed