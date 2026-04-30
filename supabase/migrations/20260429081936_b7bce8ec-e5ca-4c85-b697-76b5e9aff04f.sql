DROP VIEW IF EXISTS public.employee_documents_expiring;
CREATE VIEW public.employee_documents_expiring
WITH (security_invoker = true) AS
SELECT
  ed.*,
  (ed.expiry_date - CURRENT_DATE) AS days_until_expiry
FROM public.employee_documents ed
WHERE ed.status = 'active'
  AND ed.expiry_date IS NOT NULL
ORDER BY ed.expiry_date ASC;