-- Fix: audit_logs_detailed view is using SECURITY DEFINER (default behavior)
-- This bypasses RLS policies of the underlying tables
-- Solution: Recreate with security_invoker=true to use caller's permissions

-- Drop and recreate the view with security_invoker enabled
DROP VIEW IF EXISTS public.audit_logs_detailed;

CREATE VIEW public.audit_logs_detailed 
WITH (security_invoker = true)
AS
SELECT 
    al.id,
    al.action_type,
    al.resource_type,
    al.resource_id,
    al.performed_by_user_id,
    al.performed_by_employee_id,
    al.old_values,
    al.new_values,
    al.changes,
    al.reason,
    al.ip_address,
    al.user_agent,
    al.metadata,
    al.created_at,
    e.full_name AS performed_by_name,
    e.code AS performed_by_code
FROM audit_logs al
LEFT JOIN employees e ON e.id = al.performed_by_employee_id
ORDER BY al.created_at DESC;

-- Grant appropriate permissions
GRANT SELECT ON public.audit_logs_detailed TO authenticated;