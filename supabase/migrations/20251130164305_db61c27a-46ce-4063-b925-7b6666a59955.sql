-- =============================================
-- PAYROLL SYSTEM TABLES
-- =============================================

-- 1. Employee Payroll Settings (individual payroll configuration)
CREATE TABLE public.employee_payroll_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  
  -- Pay Type
  pay_type TEXT NOT NULL DEFAULT 'salary' CHECK (pay_type IN ('salary', 'hourly')),
  salary_per_month DECIMAL(12,2),
  hourly_rate DECIMAL(10,2),
  
  -- Social Security
  has_social_security BOOLEAN DEFAULT true,
  social_security_rate DECIMAL(5,4) DEFAULT 0.05,
  social_security_cap DECIMAL(10,2) DEFAULT 750,
  
  -- Transportation Allowance
  has_transportation BOOLEAN DEFAULT false,
  transportation_allowance DECIMAL(10,2) DEFAULT 0,
  
  -- Withholding Tax
  has_withholding_tax BOOLEAN DEFAULT false,
  withholding_tax_rate DECIMAL(5,4) DEFAULT 0,
  
  -- Flexible custom deductions/allowances (JSON arrays)
  custom_deductions JSONB DEFAULT '[]'::jsonb,
  custom_allowances JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Work Schedules (weekly schedule per employee)
CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday, etc.
  start_time TIME,
  end_time TIME,
  is_working_day BOOLEAN DEFAULT true,
  expected_hours DECIMAL(4,2) DEFAULT 8,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(employee_id, day_of_week)
);

-- 3. Payroll Periods (pay cycles with cutoff dates)
CREATE TABLE public.payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cutoff_day INTEGER DEFAULT 25 CHECK (cutoff_day >= 1 AND cutoff_day <= 31),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'paid')),
  
  total_employees INTEGER DEFAULT 0,
  total_gross_pay DECIMAL(14,2) DEFAULT 0,
  total_net_pay DECIMAL(14,2) DEFAULT 0,
  
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Payroll Records (individual payroll calculation per employee per period)
CREATE TABLE public.payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  
  pay_type TEXT NOT NULL DEFAULT 'salary',
  
  -- Work Hours
  scheduled_work_days INTEGER DEFAULT 0,
  actual_work_days INTEGER DEFAULT 0,
  total_work_hours DECIMAL(8,2) DEFAULT 0,
  
  -- Attendance Summary
  late_count INTEGER DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  absent_days INTEGER DEFAULT 0,
  leave_days DECIMAL(4,2) DEFAULT 0,
  early_leave_count INTEGER DEFAULT 0,
  
  -- Overtime
  ot_hours DECIMAL(8,2) DEFAULT 0,
  ot_pay DECIMAL(12,2) DEFAULT 0,
  
  -- Salary Calculation
  base_salary DECIMAL(12,2) DEFAULT 0,
  gross_pay DECIMAL(12,2) DEFAULT 0,
  
  -- Flexible deductions/allowances (JSON for audit trail)
  deductions JSONB DEFAULT '[]'::jsonb,
  allowances JSONB DEFAULT '[]'::jsonb,
  
  total_deductions DECIMAL(12,2) DEFAULT 0,
  total_allowances DECIMAL(12,2) DEFAULT 0,
  net_pay DECIMAL(12,2) DEFAULT 0,
  
  -- Status & Notes
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(employee_id, period_id)
);

-- Enable RLS on all tables
ALTER TABLE public.employee_payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_payroll_settings
CREATE POLICY "Admins and owners can manage employee_payroll_settings"
ON public.employee_payroll_settings FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Authenticated users can view own payroll settings"
ON public.employee_payroll_settings FOR SELECT
USING (
  employee_id IN (
    SELECT e.id FROM employees e
    JOIN users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid()
  ) OR has_admin_access(auth.uid())
);

-- RLS Policies for work_schedules
CREATE POLICY "Admins and owners can manage work_schedules"
ON public.work_schedules FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Authenticated users can view work_schedules"
ON public.work_schedules FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for payroll_periods
CREATE POLICY "Admins and owners can manage payroll_periods"
ON public.payroll_periods FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Authenticated users can view payroll_periods"
ON public.payroll_periods FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for payroll_records
CREATE POLICY "Admins and owners can manage payroll_records"
ON public.payroll_records FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Users can view own payroll records"
ON public.payroll_records FOR SELECT
USING (
  employee_id IN (
    SELECT e.id FROM employees e
    JOIN users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid()
  ) OR has_admin_access(auth.uid())
);

-- Triggers for updated_at
CREATE TRIGGER update_employee_payroll_settings_updated_at
  BEFORE UPDATE ON public.employee_payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_work_schedules_updated_at
  BEFORE UPDATE ON public.work_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payroll_periods_updated_at
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_work_schedules_employee ON public.work_schedules(employee_id);
CREATE INDEX idx_payroll_records_period ON public.payroll_records(period_id);
CREATE INDEX idx_payroll_records_employee ON public.payroll_records(employee_id);
CREATE INDEX idx_payroll_periods_status ON public.payroll_periods(status);
CREATE INDEX idx_payroll_periods_dates ON public.payroll_periods(start_date, end_date);