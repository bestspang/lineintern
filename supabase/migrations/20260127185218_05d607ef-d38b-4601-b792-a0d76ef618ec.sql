-- =============================================
-- Step 1: Create remote_checkout_requests table
-- =============================================

-- Create the table for tracking remote checkout requests
CREATE TABLE public.remote_checkout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_date DATE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  distance_from_branch DOUBLE PRECISION,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by_employee_id UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  checkin_log_id UUID REFERENCES public.attendance_logs(id),
  checkout_log_id UUID REFERENCES public.attendance_logs(id),
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE public.remote_checkout_requests IS 'Stores requests for employees to checkout from outside the allowed geofence area';
COMMENT ON COLUMN public.remote_checkout_requests.distance_from_branch IS 'Distance in meters from the branch location';
COMMENT ON COLUMN public.remote_checkout_requests.checkin_log_id IS 'Reference to the check-in log for this work session';
COMMENT ON COLUMN public.remote_checkout_requests.checkout_log_id IS 'Reference to the checkout log after approval';

-- Create indexes for efficient queries
CREATE INDEX idx_remote_checkout_employee_date ON public.remote_checkout_requests(employee_id, request_date);
CREATE INDEX idx_remote_checkout_status ON public.remote_checkout_requests(status);
CREATE INDEX idx_remote_checkout_branch ON public.remote_checkout_requests(branch_id, status);

-- Enable Row Level Security
ALTER TABLE public.remote_checkout_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Policy: Service role bypass (for edge functions)
CREATE POLICY "Service role has full access to remote_checkout_requests"
ON public.remote_checkout_requests
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_remote_checkout_requests_updated_at
  BEFORE UPDATE ON public.remote_checkout_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();