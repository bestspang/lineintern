-- Phase 0B — additive RLS so employees can read only their own bag items.
-- No INSERT/UPDATE/DELETE policy is added; mutations stay admin/HR/service-role only.
CREATE POLICY "Employees can view own bag items"
ON public.employee_bag_items
FOR SELECT
TO authenticated
USING (
  employee_id IN (
    SELECT e.id
    FROM public.employees e
    WHERE e.auth_user_id = auth.uid()
       OR e.line_user_id = (auth.jwt() ->> 'sub')
  )
);