-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Users can view receipts of their businesses" ON public.receipts;

-- Create comprehensive policy that includes admin access
CREATE POLICY "Users can view receipts" ON public.receipts
FOR SELECT TO authenticated
USING (
  -- Admin/Owner can see all receipts
  has_admin_access(auth.uid())
  OR
  -- Users can see receipts from their businesses
  business_id IN (
    SELECT id FROM receipt_businesses WHERE user_id = auth.uid()
  )
  OR
  -- Users can see their own receipts (matched by line_user_id via receipt_businesses)
  line_user_id IN (
    SELECT line_user_id FROM receipt_businesses WHERE user_id = auth.uid()
  )
);

-- Admin can insert receipts
CREATE POLICY "Admins can insert receipts" ON public.receipts
FOR INSERT TO authenticated
WITH CHECK (has_admin_access(auth.uid()));

-- Admin can update receipts
CREATE POLICY "Admins can update receipts" ON public.receipts
FOR UPDATE TO authenticated
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

-- Admin can delete receipts
CREATE POLICY "Admins can delete receipts" ON public.receipts
FOR DELETE TO authenticated
USING (has_admin_access(auth.uid()));