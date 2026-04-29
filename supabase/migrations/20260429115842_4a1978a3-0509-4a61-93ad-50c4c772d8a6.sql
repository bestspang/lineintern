-- 1. api_configurations: introduce is_public flag and tighten SELECT policy
ALTER TABLE public.api_configurations
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Mark non-sensitive client-readable keys as public
UPDATE public.api_configurations
  SET is_public = true
  WHERE key_name IN ('LIFF_ID', 'MAPBOX_PUBLIC_TOKEN', 'LINE_LOGIN_CHANNEL_ID', 'GOOGLE_CLIENT_ID');

-- Drop overly permissive SELECT policies
DROP POLICY IF EXISTS "Authenticated can read api_configurations" ON public.api_configurations;
DROP POLICY IF EXISTS "Anon can read LIFF_ID config" ON public.api_configurations;

-- Authenticated users can only read keys explicitly marked is_public
CREATE POLICY "Authenticated can read public api_configurations"
  ON public.api_configurations
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Anonymous users (LIFF, attendance pages without session) can also read public-only keys
CREATE POLICY "Anon can read public api_configurations"
  ON public.api_configurations
  FOR SELECT
  TO anon
  USING (is_public = true);

-- Admins can read everything (covered by existing "Admins can manage api_configurations" ALL policy,
-- but make SELECT explicit for clarity)
CREATE POLICY "Admins can read all api_configurations"
  ON public.api_configurations
  FOR SELECT
  TO authenticated
  USING (public.has_admin_access(auth.uid()));

-- 2. shift_assignments: restrict writes to management roles
DROP POLICY IF EXISTS "Authenticated users can manage shift assignments" ON public.shift_assignments;

CREATE POLICY "Management can insert shift assignments"
  ON public.shift_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_management_access(auth.uid()));

CREATE POLICY "Management can update shift assignments"
  ON public.shift_assignments
  FOR UPDATE
  TO authenticated
  USING (public.has_management_access(auth.uid()))
  WITH CHECK (public.has_management_access(auth.uid()));

CREATE POLICY "Management can delete shift assignments"
  ON public.shift_assignments
  FOR DELETE
  TO authenticated
  USING (public.has_management_access(auth.uid()));

-- 3. google_tokens: remove from Realtime publication so OAuth tokens are not broadcast
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'google_tokens'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.google_tokens';
  END IF;
END $$;