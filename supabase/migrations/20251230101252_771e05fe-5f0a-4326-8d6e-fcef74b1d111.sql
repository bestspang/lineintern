-- ========================================
-- DAILY DEPOSIT UPLOAD SYSTEM
-- ========================================

-- 1. Main table for daily deposits
CREATE TABLE public.daily_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  deposit_date DATE NOT NULL,
  
  -- Face verification
  face_photo_url TEXT,
  face_verified_at TIMESTAMPTZ,
  liveness_data JSONB,
  
  -- Deposit slip
  slip_photo_url TEXT,
  
  -- AI extracted data
  amount DECIMAL(12,2),
  account_number TEXT,
  bank_name TEXT,
  bank_branch TEXT,
  deposit_date_on_slip DATE,
  reference_number TEXT,
  raw_ocr_result JSONB,
  extraction_confidence DECIMAL(3,2),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  verified_by_admin_id UUID,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  admin_notes TEXT,
  
  -- Notification tracking
  notified_at TIMESTAMPTZ,
  line_message_id TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate deposits per branch per day
  CONSTRAINT unique_branch_deposit_per_day UNIQUE (branch_id, deposit_date)
);

-- 2. Settings table for deposit configuration
CREATE TABLE public.deposit_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'global',
  branch_id UUID REFERENCES public.branches(id),
  
  -- Deadline settings
  deposit_deadline TIME NOT NULL DEFAULT '16:00:00',
  reminder_time TIME NOT NULL DEFAULT '15:00:00',
  
  -- Notification settings
  notify_line_group_id TEXT,
  enable_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  enable_face_verification BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint for scope
  CONSTRAINT unique_deposit_settings_scope UNIQUE (scope, branch_id)
);

-- 3. Reminder logs table
CREATE TABLE public.deposit_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id),
  reminder_date DATE NOT NULL,
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  line_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  branches_notified JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create storage bucket for deposit slips
INSERT INTO storage.buckets (id, name, public)
VALUES ('deposit-slips', 'deposit-slips', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Enable RLS on all tables
ALTER TABLE public.daily_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_reminders ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for daily_deposits
CREATE POLICY "Admins can manage all deposits"
ON public.daily_deposits FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Employees can view own deposits"
ON public.daily_deposits FOR SELECT
USING (
  employee_id IN (
    SELECT e.id FROM employees e
    JOIN users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid()
  )
);

CREATE POLICY "Employees can create own deposits"
ON public.daily_deposits FOR INSERT
WITH CHECK (
  employee_id IN (
    SELECT e.id FROM employees e
    JOIN users u ON e.line_user_id = u.line_user_id
    WHERE u.id = auth.uid()
  )
);

CREATE POLICY "Service role can manage deposits"
ON public.daily_deposits FOR ALL
USING (true)
WITH CHECK (true);

-- 7. RLS Policies for deposit_settings
CREATE POLICY "Admins can manage deposit_settings"
ON public.deposit_settings FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Authenticated can view deposit_settings"
ON public.deposit_settings FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 8. RLS Policies for deposit_reminders
CREATE POLICY "Admins can manage deposit_reminders"
ON public.deposit_reminders FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Authenticated can view deposit_reminders"
ON public.deposit_reminders FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 9. Storage policies for deposit-slips bucket
CREATE POLICY "Admins can manage deposit slip files"
ON storage.objects FOR ALL
USING (bucket_id = 'deposit-slips' AND has_admin_access(auth.uid()))
WITH CHECK (bucket_id = 'deposit-slips' AND has_admin_access(auth.uid()));

CREATE POLICY "Employees can upload deposit slips"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'deposit-slips' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Employees can view own deposit slips"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'deposit-slips' AND
  auth.uid() IS NOT NULL
);

-- 10. Create indexes for performance
CREATE INDEX idx_daily_deposits_branch_date ON public.daily_deposits(branch_id, deposit_date);
CREATE INDEX idx_daily_deposits_employee ON public.daily_deposits(employee_id);
CREATE INDEX idx_daily_deposits_status ON public.daily_deposits(status);
CREATE INDEX idx_deposit_reminders_date ON public.deposit_reminders(reminder_date);

-- 11. Trigger for updated_at
CREATE TRIGGER update_daily_deposits_updated_at
BEFORE UPDATE ON public.daily_deposits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deposit_settings_updated_at
BEFORE UPDATE ON public.deposit_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Insert default global settings
INSERT INTO public.deposit_settings (scope, deposit_deadline, reminder_time, enable_reminder, enable_face_verification)
VALUES ('global', '16:00:00', '15:00:00', true, true)
ON CONFLICT (scope, branch_id) DO NOTHING;