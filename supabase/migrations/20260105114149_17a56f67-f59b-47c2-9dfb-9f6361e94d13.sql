-- Create or replace function to check admin access (admin OR owner)
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'owner')
  )
$$;

-- Drop existing admin-only policy
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Create new policy that includes owner
CREATE POLICY "Admin or Owner can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));