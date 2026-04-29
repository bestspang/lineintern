-- Hotfix: tighten audit log read access and retention helper execution.
-- Audit logs contain sensitive operational metadata and should not be
-- readable or purgeable by every authenticated user.

DROP POLICY IF EXISTS "Authenticated can read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admin and Owner can read audit_logs" ON public.audit_logs;

CREATE POLICY "Admin and Owner can read audit_logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
);

REVOKE EXECUTE ON FUNCTION public.cleanup_audit_logs(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_audit_logs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_logs(integer) TO service_role;

-- Register the new Audit Logs page in DB-backed page access.
-- Only owner/admin should see the page; other roles get explicit denies so
-- future default-access behavior cannot accidentally expose it.
WITH app_roles AS (
  SELECT e.enumlabel::public.app_role AS role
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typnamespace = 'public'::regnamespace
    AND t.typname = 'app_role'
)
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT
  role,
  'Dashboard',
  '/audit-logs',
  'Audit Logs',
  role::text IN ('owner', 'admin')
FROM app_roles
ON CONFLICT (role, page_path)
DO UPDATE SET
  menu_group = EXCLUDED.menu_group,
  page_name = EXCLUDED.page_name,
  can_access = EXCLUDED.can_access,
  updated_at = now();
