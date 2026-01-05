-- Create function to get all webapp users with their roles
-- This joins auth.users with user_roles using LEFT JOIN
-- Uses SECURITY DEFINER to access auth.users

CREATE OR REPLACE FUNCTION public.get_all_webapp_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  user_created_at timestamptz,
  role_id uuid,
  role text,
  granted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    u.id as user_id,
    u.email::text,
    u.created_at as user_created_at,
    ur.id as role_id,
    ur.role::text,
    ur.granted_at
  FROM auth.users u
  LEFT JOIN user_roles ur ON u.id = ur.user_id
  ORDER BY u.created_at DESC
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_all_webapp_users() TO authenticated;