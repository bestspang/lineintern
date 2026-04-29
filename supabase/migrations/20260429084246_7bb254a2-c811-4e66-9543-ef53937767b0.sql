-- Phase 1A.1: Employee Documents — upload confirmation column (retry)

ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'pending';

UPDATE public.employee_documents
SET upload_status = 'uploaded'
WHERE upload_status = 'pending'
  AND created_at < now();

ALTER TABLE public.employee_documents
  DROP CONSTRAINT IF EXISTS employee_documents_upload_status_chk;
ALTER TABLE public.employee_documents
  ADD CONSTRAINT employee_documents_upload_status_chk
  CHECK (upload_status IN ('pending','uploaded','failed'));

CREATE INDEX IF NOT EXISTS idx_employee_documents_upload_status
  ON public.employee_documents(upload_status);

DROP POLICY IF EXISTS "employee_view_own_visible" ON public.employee_documents;
CREATE POLICY "employee_view_own_visible"
ON public.employee_documents
FOR SELECT
TO authenticated
USING (
  visibility = 'employee_visible'
  AND status <> 'archived'
  AND upload_status = 'uploaded'
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    WHERE e.auth_user_id = auth.uid()
       OR e.line_user_id IN (SELECT u.line_user_id FROM public.users u WHERE u.id = auth.uid())
  )
);

DROP POLICY IF EXISTS "manager_view_scoped_visible" ON public.employee_documents;
CREATE POLICY "manager_view_scoped_visible"
ON public.employee_documents
FOR SELECT
TO authenticated
USING (
  visibility = 'employee_visible'
  AND status <> 'archived'
  AND upload_status = 'uploaded'
  AND public.can_view_employee_by_priority(auth.uid(), employee_id)
);

-- View must be dropped because column shape changes with ed.*
DROP VIEW IF EXISTS public.employee_documents_expiring;
CREATE VIEW public.employee_documents_expiring AS
SELECT
  ed.*,
  (ed.expiry_date - CURRENT_DATE) AS days_until_expiry
FROM public.employee_documents ed
WHERE ed.status = 'active'
  AND ed.upload_status = 'uploaded'
  AND ed.expiry_date IS NOT NULL
ORDER BY ed.expiry_date ASC;