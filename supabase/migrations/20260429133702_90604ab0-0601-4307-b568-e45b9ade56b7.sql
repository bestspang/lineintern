-- 1) Drop legacy table (receipts feature removed in Phase 2-4)
DROP TABLE IF EXISTS public.receipt_approvers CASCADE;

-- 2) system_settings — admin-only writes
DROP POLICY IF EXISTS "Authenticated can update system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated can read system_settings"   ON public.system_settings;
CREATE POLICY "Admins manage system_settings"
  ON public.system_settings FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));
CREATE POLICY "Authenticated read system_settings"
  ON public.system_settings FOR SELECT TO authenticated
  USING (true);

-- 3) point_rules — admin-only writes; public read preserved
DROP POLICY IF EXISTS "Service role can modify point_rules" ON public.point_rules;
CREATE POLICY "Admins manage point_rules"
  ON public.point_rules FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

-- 4) safety_rules — drop duplicate permissive policy (admin-only policy already exists)
DROP POLICY IF EXISTS "Authenticated users can manage safety_rules" ON public.safety_rules;

-- 5) shift_templates — admin-only writes; public read of active templates preserved
DROP POLICY IF EXISTS "Authenticated users can manage shift templates" ON public.shift_templates;
CREATE POLICY "Admins manage shift_templates"
  ON public.shift_templates FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

-- 6) weekly_schedules — admin-only writes; public read preserved
DROP POLICY IF EXISTS "Authenticated users can manage weekly schedules" ON public.weekly_schedules;
CREATE POLICY "Admins manage weekly_schedules"
  ON public.weekly_schedules FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

-- 7) work_sessions — drop legacy permissive policies; admin-only mutation policies remain.
-- Service role bypasses RLS, so backfill edge functions keep working.
DROP POLICY IF EXISTS "System can update work sessions" ON public.work_sessions;
DROP POLICY IF EXISTS "System can insert work sessions" ON public.work_sessions;
DROP POLICY IF EXISTS "Service role and admins can insert work_sessions" ON public.work_sessions;
DROP POLICY IF EXISTS "Authenticated users can view work_sessions" ON public.work_sessions;
DROP POLICY IF EXISTS "Admins can manage work_sessions" ON public.work_sessions;

-- Add a scoped SELECT policy so users can still see relevant sessions
CREATE POLICY "Users can view own or accessible work_sessions"
  ON public.work_sessions FOR SELECT TO authenticated
  USING (
    public.has_admin_access(auth.uid())
    OR public.can_view_employee_by_priority(auth.uid(), employee_id)
  );

-- 8) Realtime — ensure google_tokens is not in the realtime publication (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'google_tokens'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.google_tokens';
  END IF;
END $$;