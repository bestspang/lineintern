CREATE TABLE IF NOT EXISTS public.portal_performance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  duration_ms integer,
  route text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  error_code text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_performance_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_performance_events'
      AND policyname = 'portal_perf_insert_anon'
  ) THEN
    CREATE POLICY portal_perf_insert_anon
      ON public.portal_performance_events
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_performance_events'
      AND policyname = 'portal_perf_select_admin'
  ) THEN
    CREATE POLICY portal_perf_select_admin
      ON public.portal_performance_events
      FOR SELECT
      TO authenticated
      USING (
        public.has_admin_access(auth.uid())
        OR public.has_hr_access(auth.uid())
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_portal_perf_event_created
  ON public.portal_performance_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_perf_employee_created
  ON public.portal_performance_events (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_tokens_status_expires_active
  ON public.attendance_tokens (status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_employee_menu_tokens_expires
  ON public.employee_menu_tokens (expires_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'line_user_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_line_user_id ON public.notifications (line_user_id) WHERE line_user_id IS NOT NULL';
  END IF;
END$$;