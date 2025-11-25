-- Create leave_requests table for managing employee leave requests
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('sick', 'personal', 'vacation', 'emergency', 'annual')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by_admin_id UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  line_message_id TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Enable RLS
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Employees can view their own leave requests
CREATE POLICY "Employees can view own leave requests"
ON public.leave_requests FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE line_user_id = (
      SELECT line_user_id FROM public.users WHERE id = auth.uid()
    )
  )
);

-- Employees can create their own leave requests
CREATE POLICY "Employees can create own leave requests"
ON public.leave_requests FOR INSERT
WITH CHECK (
  employee_id IN (
    SELECT id FROM public.employees WHERE line_user_id = (
      SELECT line_user_id FROM public.users WHERE id = auth.uid()
    )
  )
);

-- Admins and executives can view all leave requests
CREATE POLICY "Admins and executives can view all leave requests"
ON public.leave_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid() AND e.role IN ('admin', 'executive')
  )
);

-- Admins and executives can update leave requests
CREATE POLICY "Admins and executives can update leave requests"
ON public.leave_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid() AND e.role IN ('admin', 'executive')
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON public.leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON public.leave_requests(start_date, end_date);

-- Trigger to update updated_at
CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();