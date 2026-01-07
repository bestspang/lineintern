-- Drop existing SELECT policy on users table
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

-- Create updated SELECT policy that includes field access
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() 
    OR has_admin_access(auth.uid()) 
    OR has_field_access(auth.uid())
  );