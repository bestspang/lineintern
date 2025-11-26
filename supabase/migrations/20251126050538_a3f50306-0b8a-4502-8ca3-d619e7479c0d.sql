-- Fix training_requests RLS policy
DROP POLICY IF EXISTS "Authenticated users can manage training_requests" ON public.training_requests;

CREATE POLICY "Authenticated users can view training_requests" ON public.training_requests
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and owners can manage training_requests" ON public.training_requests
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));