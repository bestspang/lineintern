CREATE TABLE public.webhook_verification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_url TEXT,
  expected_url TEXT NOT NULL,
  is_match BOOLEAN NOT NULL DEFAULT false,
  test_success BOOLEAN,
  test_status_code INTEGER,
  test_reason TEXT,
  raw_response JSONB,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_verification_logs_checked_at
  ON public.webhook_verification_logs (checked_at DESC);

ALTER TABLE public.webhook_verification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner can view webhook verification logs"
ON public.webhook_verification_logs
FOR SELECT
TO authenticated
USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Service role can insert webhook verification logs"
ON public.webhook_verification_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_admin_access(auth.uid()));