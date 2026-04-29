-- Phase 0A finishing: audit_logs retention helper.
-- Adds a SECURITY DEFINER function that deletes audit rows older than the
-- given number of days. Default retention = 180 days. Returns count.
-- The cron schedule is created separately via the insert tool (not as a
-- migration) because it is environment-specific.

CREATE OR REPLACE FUNCTION public.cleanup_audit_logs(retention_days integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF retention_days IS NULL OR retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1';
  END IF;

  WITH del AS (
    DELETE FROM public.audit_logs
    WHERE created_at < (now() - make_interval(days => retention_days))
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM del;

  -- Audit the cleanup itself so deletions are themselves traceable.
  INSERT INTO public.audit_logs(action_type, resource_type, reason, metadata)
  VALUES (
    'cleanup',
    'audit_logs',
    format('cleanup_audit_logs(%s) removed %s rows', retention_days, v_deleted),
    jsonb_build_object(
      'function', 'cleanup_audit_logs',
      'retention_days', retention_days,
      'deleted_count', v_deleted
    )
  );

  RETURN v_deleted;
END;
$$;

-- Restrict execution. Service role and authenticated DB users can call it
-- explicitly, but anon cannot.
REVOKE ALL ON FUNCTION public.cleanup_audit_logs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_logs(integer) TO authenticated;