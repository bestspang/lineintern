-- Fix search_path for get_role_priority function
CREATE OR REPLACE FUNCTION public.get_role_priority(role_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE role_name
    WHEN 'owner' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'executive' THEN 3
    WHEN 'manager' THEN 4
    WHEN 'moderator' THEN 5
    WHEN 'field' THEN 6
    WHEN 'user' THEN 7
    ELSE 999
  END;
END;
$$;