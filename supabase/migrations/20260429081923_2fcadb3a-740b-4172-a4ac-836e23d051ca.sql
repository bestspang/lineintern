
-- ============================================================
-- Phase 1A: Employee Documents Module
-- ============================================================

-- 1. Table -----------------------------------------------------
CREATE TABLE public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  title text NOT NULL,
  description text NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_mime_type text NULL,
  file_size_bytes bigint NULL,
  issue_date date NULL,
  expiry_date date NULL,
  status text NOT NULL DEFAULT 'active',
  visibility text NOT NULL DEFAULT 'hr_only',
  uploaded_by_user_id uuid NULL,
  uploaded_by_employee_id uuid NULL,
  replaced_by_document_id uuid NULL REFERENCES public.employee_documents(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  archived_by_user_id uuid NULL,
  CONSTRAINT employee_documents_status_chk
    CHECK (status IN ('active','expired','archived','replaced')),
  CONSTRAINT employee_documents_visibility_chk
    CHECK (visibility IN ('hr_only','employee_visible')),
  CONSTRAINT employee_documents_type_chk
    CHECK (document_type IN (
      'employment_contract','id_card','house_registration','bank_book',
      'work_permit','certificate','warning_letter','probation',
      'salary_adjustment','resignation','other'
    ))
);

CREATE INDEX idx_employee_documents_employee_id  ON public.employee_documents(employee_id);
CREATE INDEX idx_employee_documents_type         ON public.employee_documents(document_type);
CREATE INDEX idx_employee_documents_status       ON public.employee_documents(status);
CREATE INDEX idx_employee_documents_expiry       ON public.employee_documents(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_employee_documents_uploaded_by  ON public.employee_documents(uploaded_by_user_id);

-- updated_at trigger (uses existing helper)
CREATE TRIGGER trg_employee_documents_updated_at
  BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RLS -------------------------------------------------------
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- HR / Admin / Owner can manage everything
CREATE POLICY "admin_hr_manage_all"
ON public.employee_documents
FOR ALL
TO authenticated
USING (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid()))
WITH CHECK (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid()));

-- Employees can view their own employee_visible, non-archived docs
CREATE POLICY "employee_view_own_visible"
ON public.employee_documents
FOR SELECT
TO authenticated
USING (
  visibility = 'employee_visible'
  AND status <> 'archived'
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    WHERE e.auth_user_id = auth.uid()
       OR e.line_user_id IN (SELECT u.line_user_id FROM public.users u WHERE u.id = auth.uid())
  )
);

-- Managers can view employee_visible docs for employees in their scope
CREATE POLICY "manager_view_scoped_visible"
ON public.employee_documents
FOR SELECT
TO authenticated
USING (
  visibility = 'employee_visible'
  AND status <> 'archived'
  AND public.can_view_employee_by_priority(auth.uid(), employee_id)
);

-- Service role
CREATE POLICY "service_role_all"
ON public.employee_documents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Expiring view --------------------------------------------
CREATE OR REPLACE VIEW public.employee_documents_expiring AS
SELECT
  ed.*,
  (ed.expiry_date - CURRENT_DATE) AS days_until_expiry
FROM public.employee_documents ed
WHERE ed.status = 'active'
  AND ed.expiry_date IS NOT NULL
ORDER BY ed.expiry_date ASC;

-- 4. Storage bucket -------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: HR/Admin direct, all others through edge functions
CREATE POLICY "employee_documents_hr_admin_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'employee-documents'
       AND (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid())));

CREATE POLICY "employee_documents_hr_admin_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'employee-documents'
            AND (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid())));

CREATE POLICY "employee_documents_hr_admin_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'employee-documents'
       AND (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid())));

CREATE POLICY "employee_documents_hr_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'employee-documents'
       AND (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid())));
