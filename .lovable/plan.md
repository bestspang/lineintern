
# Phase 1A.1 — Upload Confirm + Clearer Signed-URL Errors

Adds an upload-confirmation step so failed Storage uploads no longer leave orphan metadata rows, and surfaces structured error codes so the UI can show clear Thai messages when a file is missing, expired, or forbidden. Strictly additive. No protected systems touched.

## Why
Today: `employee-document-upload` inserts the row first, then returns a signed upload URL. If the browser dies mid-upload, an `employee_documents` row exists pointing at a Storage object that was never written. HR sees a phantom doc; non-HR currently can't see it (visibility is hr_only by default), so it's not a security bug — just data hygiene + bad UX when downloads fail with cryptic errors.

## Changes (8 files, 1 new edge function, 1 migration)

### 1. Migration — add `upload_status` column
File: `supabase/migrations/<ts>_employee_documents_upload_status.sql`

```sql
ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'pending';

-- Backfill existing Phase 1A rows so they remain visible
UPDATE public.employee_documents
SET upload_status = 'uploaded'
WHERE upload_status = 'pending' AND created_at < now();

ALTER TABLE public.employee_documents
  ADD CONSTRAINT employee_documents_upload_status_chk
  CHECK (upload_status IN ('pending','uploaded','failed'));

CREATE INDEX IF NOT EXISTS idx_employee_documents_upload_status
  ON public.employee_documents(upload_status);

-- Tighten employee/manager visibility — must not see orphan rows.
-- HR/Admin keep full visibility via existing admin_hr_manage_all so they
-- can still see and clean up pending/failed uploads.
DROP POLICY IF EXISTS "employee_view_own_visible" ON public.employee_documents;
CREATE POLICY "employee_view_own_visible"
ON public.employee_documents FOR SELECT TO authenticated
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
ON public.employee_documents FOR SELECT TO authenticated
USING (
  visibility = 'employee_visible'
  AND status <> 'archived'
  AND upload_status = 'uploaded'
  AND public.can_view_employee_by_priority(auth.uid(), employee_id)
);

CREATE OR REPLACE VIEW public.employee_documents_expiring AS
SELECT ed.*, (ed.expiry_date - CURRENT_DATE) AS days_until_expiry
FROM public.employee_documents ed
WHERE ed.status = 'active' AND ed.upload_status = 'uploaded'
  AND ed.expiry_date IS NOT NULL
ORDER BY ed.expiry_date ASC;
```

Backfill is non-destructive — sets every existing Phase 1A row to `uploaded`. New rows default to `pending`.

### 2. New edge function — `employee-document-confirm-upload`
File: `supabase/functions/employee-document-confirm-upload/index.ts`

- HR/Admin/Owner only (`requireRole(["owner","admin","hr"])`).
- Body: `{ document_id: string, failed?: boolean, failure_reason?: string }`.
- If `failed: true` → set `upload_status='failed'`, audit `upload_failed`, return 200.
- Else: list the parent folder in `employee-documents` bucket, check the filename exists.
  - Object missing → return `{ error: "file_missing" }` HTTP 410, leave row `pending` so a retry can still complete.
  - Object exists → set `upload_status='uploaded'`, audit `upload_confirmed`, return 200.
- Uses `supabase.storage.from(...).list(folder, { search: filename })` — does not download bytes.

### 3. `employee-document-upload` — no behavioral change
Row is inserted with the new column defaulting to `pending`. No code change needed — the column default does the work. (We deliberately do not flip to `uploaded` here, so the confirm step is the single source of truth.)

### 4. `employee-document-signed-url` — structured error codes
Replace ad-hoc strings with stable codes so the UI can map them:

| Code | HTTP | Meaning |
|---|---|---|
| `not_found` | 404 | Document row does not exist |
| `forbidden_visibility` | 403 | Non-HR tried to fetch hr_only |
| `forbidden_scope` | 403 | Caller is neither owner nor in scope |
| `not_yet_uploaded` | 409 | `upload_status = 'pending'` (HR-only path) |
| `upload_failed` | 410 | `upload_status = 'failed'` |
| `file_missing` | 410 | Storage object gone |
| `storage_error` | 502 | Signing call failed |

Implementation notes:
- For non-HR callers, RLS + the `upload_status='uploaded'` filter mean they will never see pending/failed rows in the table — but the edge function uses service role, so add an explicit early check after the visibility/ownership gate:
  - If `upload_status === 'pending'` → 409 `not_yet_uploaded` (HR sees this).
  - If `upload_status === 'failed'` → 410 `upload_failed`.
- Before signing, do the same `list()` existence check used by confirm. If missing → 410 `file_missing` (also auto-flip the row to `failed` so it's visible in the cleanup view).
- Audit metadata gains `error_code` on failure paths so `audit_logs` records why a download failed.

### 5. `UploadDocumentDialog.tsx` — call confirm after upload
After a successful `uploadToSignedUrl`:

```ts
await supabase.functions.invoke("employee-document-confirm-upload", {
  body: { document_id: meta.document_id },
});
```

If `uploadToSignedUrl` throws OR the confirm call returns an error: invoke confirm with `{ document_id, failed: true, failure_reason: errMsg }` so HR can see the failed row and decide whether to retry or delete. Toast shows: "อัปโหลดล้มเหลว — เอกสารถูกทำเครื่องหมายว่าล้มเหลว".

### 6. `EmployeeDocumentsTab.tsx` — clearer download errors + status surfacing
- Map signed-url error codes to Thai toasts:
  - `file_missing` / `upload_failed` → "ไฟล์หาย หรือยังอัปโหลดไม่สำเร็จ — กรุณาอัปโหลดใหม่"
  - `not_yet_uploaded` → "เอกสารยังอัปโหลดไม่เสร็จ — รอสักครู่หรืออัปโหลดใหม่"
  - `forbidden_visibility` / `forbidden_scope` → "คุณไม่มีสิทธิ์เข้าถึงเอกสารนี้"
  - `not_found` → "ไม่พบเอกสาร"
  - default → existing message
- Add an `upload_status` badge column (visible to HR only — non-HR rows are filtered by RLS so they never see non-`uploaded`):
  - `pending` → outline badge "กำลังอัปโหลด"
  - `failed` → destructive badge "อัปโหลดล้มเหลว"
- Add a status filter option `pending_or_failed` for HR cleanup.
- For `failed`/`pending` rows, replace the Download button with a "ลบรายการที่ค้าง" button that calls `employee-document-archive` (already exists, soft-deletes) so HR can clean up without a new endpoint.

### 7. `EmployeeDocuments.tsx` (admin cross-employee page)
- Default query adds `.eq("upload_status", "uploaded")` so HR sees only real docs by default.
- Add an "อัปโหลดล้างค้าง" filter chip (HR-only) that flips it to show pending/failed rows for cleanup.

### 8. `src/lib/employee-document-types.ts`
- Add `upload_status: "pending" | "uploaded" | "failed"` to `EmployeeDocument`.
- Add `UPLOAD_STATUS_LABEL_TH` map.
- Add `SIGNED_URL_ERROR_CODE_TH` map for the 7 error codes above.

## What stays untouched
- `claim_attendance_token`, attendance-submit, attendance-validate-token.
- `line-webhook`, Bangkok timezone helpers.
- Payroll math, point ledger, leave/OT approval.
- Portal check-in/check-out flow.
- `employee-document-archive`, `employee-document-replace` — unchanged behavior.
- Existing RLS policies for HR/Admin (`admin_hr_manage_all`) — kept as-is so HR can still see and act on pending/failed rows.

## Manual verification checklist (post-deploy)
1. Upload a file → row created `pending` → upload succeeds → confirm called → row flips `uploaded` → audit `upload_confirmed`.
2. Cancel upload mid-flight → confirm called with `failed:true` → row `failed` → HR sees red badge.
3. HR clicks "ลบรายการที่ค้าง" on a failed row → archived, hidden from default list.
4. HR tries to download a `pending` row → 409 `not_yet_uploaded` → clear toast.
5. Manually delete a Storage object then download → 410 `file_missing` → row auto-flipped to `failed` → clear toast.
6. Employee tries to download own `employee_visible` `uploaded` doc → still works (regression check).
7. Employee tries to download own `pending` doc → row not visible via RLS, signed-url returns 409 → clear toast.

## Verdict path
After approval and apply: Phase 1A.1 closed, Phase 1B Performance unblocked.
