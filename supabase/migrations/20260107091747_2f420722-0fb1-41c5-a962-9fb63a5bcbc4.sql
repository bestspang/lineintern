-- Fix: Retry RLS policies without assigned_by_user_id

-- 1.3 tasks - Allow users to view their assigned tasks or if admin/field
DROP POLICY IF EXISTS "Authenticated users can view tasks" ON public.tasks;

CREATE POLICY "Authenticated users can view tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  has_admin_access(auth.uid())
  OR has_field_access(auth.uid())
  OR assigned_to_user_id = auth.uid()
);