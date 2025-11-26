-- Phase 2: Fix conflicting RLS policies and cleanup

-- 1. Fix tasks table - remove conflicting policies
DROP POLICY IF EXISTS "Authenticated users can manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users can view tasks" ON public.tasks;
-- Keep only: "Admins and owners can manage tasks" (already exists)

-- 2. Fix user_profiles table - update to use has_admin_access
DROP POLICY IF EXISTS "Admins can manage user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Authenticated users can manage user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Authenticated users can view user_profiles" ON public.user_profiles;

CREATE POLICY "Authenticated users can view user_profiles" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and owners can manage user_profiles" ON public.user_profiles
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- 3. Fix profiles table - restrict to admin/owner
DROP POLICY IF EXISTS "Authenticated users can manage profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and owners can manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- 4. Fix reports table - restrict to admin/owner
DROP POLICY IF EXISTS "Authenticated users can manage reports" ON public.reports;

CREATE POLICY "Authenticated users can view reports" ON public.reports
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and owners can manage reports" ON public.reports
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));