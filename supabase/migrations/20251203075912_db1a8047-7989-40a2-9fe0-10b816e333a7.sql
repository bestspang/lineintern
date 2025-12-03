-- Phase 1: Flexible Day-Off System Database Schema

-- 1. Add columns to employees table for flexible day-off settings
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS flexible_day_off_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS flexible_days_per_week integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS flexible_advance_days_required integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS flexible_auto_approve boolean DEFAULT false;

-- 2. Create flexible_day_off_requests table
CREATE TABLE IF NOT EXISTS public.flexible_day_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_off_date date NOT NULL,
  week_start_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  approved_by_admin_id uuid,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT unique_employee_dayoff_date UNIQUE (employee_id, day_off_date)
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_flexible_dayoff_employee ON public.flexible_day_off_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_flexible_dayoff_date ON public.flexible_day_off_requests(day_off_date);
CREATE INDEX IF NOT EXISTS idx_flexible_dayoff_week ON public.flexible_day_off_requests(week_start_date);
CREATE INDEX IF NOT EXISTS idx_flexible_dayoff_status ON public.flexible_day_off_requests(status);

-- 4. Enable RLS
ALTER TABLE public.flexible_day_off_requests ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies
-- Admins and owners can manage all flexible day-off requests
CREATE POLICY "Admins and owners can manage flexible_day_off_requests"
ON public.flexible_day_off_requests
FOR ALL
TO authenticated
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

-- Users can view their own flexible day-off requests
CREATE POLICY "Users can view own flexible day-off requests"
ON public.flexible_day_off_requests
FOR SELECT
TO authenticated
USING (
  employee_id IN (
    SELECT e.id FROM employees e
    JOIN users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid()
  )
  OR has_admin_access(auth.uid())
);

-- Users can create their own flexible day-off requests
CREATE POLICY "Users can create own flexible day-off requests"
ON public.flexible_day_off_requests
FOR INSERT
TO authenticated
WITH CHECK (
  employee_id IN (
    SELECT e.id FROM employees e
    JOIN users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid()
  )
);

-- Users can cancel their own pending requests
CREATE POLICY "Users can update own pending flexible day-off requests"
ON public.flexible_day_off_requests
FOR UPDATE
TO authenticated
USING (
  employee_id IN (
    SELECT e.id FROM employees e
    JOIN users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid()
  )
  AND status = 'pending'
);

-- 6. Create trigger for updated_at
CREATE TRIGGER update_flexible_day_off_requests_updated_at
  BEFORE UPDATE ON public.flexible_day_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Add comments for documentation
COMMENT ON TABLE public.flexible_day_off_requests IS 'Stores flexible day-off requests for employees who can choose their own weekly day(s) off';
COMMENT ON COLUMN public.employees.flexible_day_off_enabled IS 'Whether employee can choose flexible day(s) off each week';
COMMENT ON COLUMN public.employees.flexible_days_per_week IS 'Number of flexible days off allowed per week (1-7)';
COMMENT ON COLUMN public.employees.flexible_advance_days_required IS 'Minimum days in advance required to request day off';
COMMENT ON COLUMN public.employees.flexible_auto_approve IS 'Whether flexible day-off requests are auto-approved';