
-- Create ai_query_audit_logs table for persistent audit trail
CREATE TABLE public.ai_query_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) NOT NULL,
  group_id uuid REFERENCES public.groups(id) NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  target_group_ids text[] DEFAULT '{}',
  data_sources_used text[] DEFAULT '{}',
  sources_used jsonb DEFAULT '[]',
  policy_id uuid REFERENCES public.ai_query_policies(id),
  evidence_count int DEFAULT 0,
  response_time_ms int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_query_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only users with management access can read audit logs
CREATE POLICY "Management can view audit logs"
  ON public.ai_query_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_management_access(auth.uid()));

-- Edge functions (service role) can insert audit logs
CREATE POLICY "Service role can insert audit logs"
  ON public.ai_query_audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Index for common queries
CREATE INDEX idx_ai_query_audit_logs_created_at ON public.ai_query_audit_logs(created_at DESC);
CREATE INDEX idx_ai_query_audit_logs_user_id ON public.ai_query_audit_logs(user_id);
CREATE INDEX idx_ai_query_audit_logs_group_id ON public.ai_query_audit_logs(group_id);
