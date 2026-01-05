-- Function to get user's role priority
CREATE OR REPLACE FUNCTION public.get_user_role_priority(user_id uuid)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role::text INTO user_role
  FROM user_roles
  WHERE user_roles.user_id = $1
  LIMIT 1;
  
  RETURN CASE user_role
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

-- Function to get role priority by name
CREATE OR REPLACE FUNCTION public.get_role_priority(role_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
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

-- Drop existing UPDATE policies on webapp_menu_config if any
DROP POLICY IF EXISTS "Admin can manage menu config" ON webapp_menu_config;

-- Create hierarchical policies for webapp_menu_config
CREATE POLICY "Admin can read menu config"
ON webapp_menu_config FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Can only update lower role menu configs"
ON webapp_menu_config FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  AND public.get_user_role_priority(auth.uid()) < public.get_role_priority(role::text)
);

CREATE POLICY "Can only insert lower role menu configs"
ON webapp_menu_config FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  AND public.get_user_role_priority(auth.uid()) < public.get_role_priority(role::text)
);

CREATE POLICY "Can only delete lower role menu configs"
ON webapp_menu_config FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  AND public.get_user_role_priority(auth.uid()) < public.get_role_priority(role::text)
);

-- Drop existing policies on webapp_page_config
DROP POLICY IF EXISTS "Admin can manage page config" ON webapp_page_config;
DROP POLICY IF EXISTS "Authenticated can read page config" ON webapp_page_config;

-- Create hierarchical policies for webapp_page_config
CREATE POLICY "Anyone can read page config"
ON webapp_page_config FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Can only update lower role page configs"
ON webapp_page_config FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  AND public.get_user_role_priority(auth.uid()) < public.get_role_priority(role::text)
);

CREATE POLICY "Can only insert lower role page configs"
ON webapp_page_config FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  AND public.get_user_role_priority(auth.uid()) < public.get_role_priority(role::text)
);

CREATE POLICY "Can only delete lower role page configs"
ON webapp_page_config FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  AND public.get_user_role_priority(auth.uid()) < public.get_role_priority(role::text)
);