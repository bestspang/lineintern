-- Drop the overly permissive ALL policy
DROP POLICY IF EXISTS "Authenticated users can manage feature flags" ON public.feature_flags;

-- Keep SELECT open for all authenticated users (needed by useFeatureFlag hook)
-- The existing "Anyone can read feature flags" SELECT policy stays

-- Add admin-only policies for write operations
CREATE POLICY "Admins can insert feature flags"
ON public.feature_flags
FOR INSERT
TO authenticated
WITH CHECK (public.has_admin_access(auth.uid()));

CREATE POLICY "Admins can update feature flags"
ON public.feature_flags
FOR UPDATE
TO authenticated
USING (public.has_admin_access(auth.uid()))
WITH CHECK (public.has_admin_access(auth.uid()));

CREATE POLICY "Admins can delete feature flags"
ON public.feature_flags
FOR DELETE
TO authenticated
USING (public.has_admin_access(auth.uid()));