-- Fix Security Definer View Warning
-- The audit_logs_detailed view doesn't need SECURITY DEFINER since RLS on audit_logs handles access control

DROP VIEW IF EXISTS audit_logs_detailed;

CREATE OR REPLACE VIEW audit_logs_detailed AS
SELECT 
  al.*,
  e.full_name as performed_by_name,
  e.code as performed_by_code
FROM audit_logs al
LEFT JOIN employees e ON e.id = al.performed_by_employee_id
ORDER BY al.created_at DESC;

COMMENT ON VIEW audit_logs_detailed IS 'Audit logs with employee details - uses RLS from underlying table';