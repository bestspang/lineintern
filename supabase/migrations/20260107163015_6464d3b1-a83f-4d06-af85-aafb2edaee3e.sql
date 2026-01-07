-- Update RLS for receipt_files table to allow admin access
DROP POLICY IF EXISTS "Users can view files of their receipts" ON public.receipt_files;

CREATE POLICY "Users can view receipt files" ON public.receipt_files
FOR SELECT TO authenticated
USING (
  -- Admin can see all files
  has_admin_access(auth.uid())
  OR
  -- Users can view files of their receipts (via businesses)
  receipt_id IN (
    SELECT id FROM receipts 
    WHERE business_id IN (
      SELECT id FROM receipt_businesses WHERE user_id = auth.uid()
    )
    OR line_user_id IN (
      SELECT line_user_id FROM receipt_businesses WHERE user_id = auth.uid()
    )
  )
);

-- Update storage policy for receipt-files bucket
DROP POLICY IF EXISTS "Anyone can view receipt files" ON storage.objects;

CREATE POLICY "Authenticated users can view receipt files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'receipt-files'
  AND (
    has_admin_access(auth.uid())
    OR
    -- Allow users with access to receipts
    EXISTS (
      SELECT 1 FROM receipt_files rf
      JOIN receipts r ON r.id = rf.receipt_id
      WHERE rf.storage_path = name
      AND (
        r.business_id IN (SELECT id FROM receipt_businesses WHERE user_id = auth.uid())
        OR r.line_user_id IN (SELECT line_user_id FROM receipt_businesses WHERE user_id = auth.uid())
      )
    )
  )
);