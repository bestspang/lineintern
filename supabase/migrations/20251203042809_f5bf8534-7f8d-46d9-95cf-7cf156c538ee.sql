-- Create attendance_adjustments table for historical data editing
CREATE TABLE public.attendance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  adjustment_date DATE NOT NULL,
  
  -- Override fields
  override_status TEXT,  -- 'present', 'absent', 'leave', 'day_off', 'holiday', 'sick'
  override_check_in TIME,
  override_check_out TIME,
  override_work_hours NUMERIC,
  override_ot_hours NUMERIC,
  leave_type TEXT,       -- 'vacation', 'sick', 'personal', 'day_off', etc.
  
  -- Metadata
  reason TEXT NOT NULL,  -- Required reason for adjustment
  adjusted_by_user_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(employee_id, adjustment_date)
);

-- Create index for efficient lookups
CREATE INDEX idx_attendance_adjustments_employee_date 
ON attendance_adjustments(employee_id, adjustment_date);

-- Enable RLS
ALTER TABLE public.attendance_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS policies - Admin only can manage
CREATE POLICY "Admins can manage attendance_adjustments"
ON public.attendance_adjustments
FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

-- Authenticated users can view
CREATE POLICY "Authenticated users can view attendance_adjustments"
ON public.attendance_adjustments
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_attendance_adjustments_updated_at
BEFORE UPDATE ON public.attendance_adjustments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();