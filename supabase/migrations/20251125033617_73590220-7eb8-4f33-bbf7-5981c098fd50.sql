-- Fix: Add INSERT policy for work_sessions (allow service role and admins)
CREATE POLICY "Service role and admins can insert work_sessions"
ON public.work_sessions
FOR INSERT
TO public
WITH CHECK (
  auth.uid() IS NOT NULL OR
  auth.jwt() ->> 'role' = 'service_role' OR
  has_role(auth.uid(), 'admin'::app_role)
);