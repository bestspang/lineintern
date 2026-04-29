# Phase 1A — Employee Documents Module

## 1. Findings (Existing Document Structure)

**`document_uploads` table (existing) — DO NOT REUSE**
- Columns: `photo_url`, `photo_hash`, `is_duplicate`, `duplicate_of_id`, `extracted_data` (jsonb), `classification_confidence`, `branch_id`, `upload_date`, `line_message_id`.
- Clearly designed for **receipt/photo OCR classification**, not HR documents.
- Currently empty (0 rows) and has **no code references** in the project.
- Has RLS allowing employees to view their own (correct for receipts, wrong for HR).
- **Decision**: Create a new dedicated `employee_documents` table. Leave `document_uploads` untouched (additive, low-risk).

**Storage buckets (existing)**: `attendance-photos` (private), `deposit-slips` (private), `receipt-files` (private), `line-bot-assets` (public), `richmenu-images` (public). No HR document bucket exists. → Create new private bucket `employee-documents`.

**Helpers available**: `has_admin_access()`, `has_hr_access()`, `can_view_employee_by_priority()`, `update_updated_at_column()`, `_shared/audit.ts` (`writeAuditLog`), `_shared/auth.ts` (`requireRole`).

**Employee Detail page**: `src/pages/attendance/EmployeeDetail.tsx` already uses Tabs — clean integration point.

---

## 2. Database Migration

Create `public.employee_documents`:

| column | type | notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| employee_id | uuid NOT NULL → employees(id) ON DELETE CASCADE | |
| document_type | text NOT NULL | enum-by-convention (employment_contract, id_card, house_registration, bank_book, work_permit, certificate, warning_letter, probation, salary_adjustment, resignation, other) |
| title | text NOT NULL | |
| description | text NULL | |
| file_path | text NOT NULL | storage path inside bucket |
| file_name | text NOT NULL | |
| file_mime_type | text NULL | |
| file_size_bytes | bigint NULL | |
| issue_date | date NULL | |
| expiry_date | date NULL | |
| status | text NOT NULL default 'active' | CHECK in (active, expired, archived, replaced) |
| visibility | text NOT NULL default 'hr_only' | CHECK in (hr_only, employee_visible) |
| uploaded_by_user_id | uuid NULL | |
| uploaded_by_employee_id | uuid NULL | |
| replaced_by_document_id | uuid NULL → self | |
| metadata | jsonb NOT NULL default '{}' | |
| created_at / updated_at | timestamptz NOT NULL default now() | trigger uses `update_updated_at_column` |
| archived_at | timestamptz NULL | |
| archived_by_user_id | uuid NULL | |

Indexes: employee_id, document_type, status, expiry_date, uploaded_by_user_id.

**RLS policies** (enable RLS):
- `admin_hr_manage_all` (ALL): `has_admin_access(auth.uid()) OR has_hr_access(auth.uid())`
- `employee_view_own_visible` (SELECT): `visibility = 'employee_visible' AND status != 'archived' AND employee_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid() OR line_user_id IN (SELECT line_user_id FROM users WHERE id = auth.uid()))`
- `manager_view_scoped` (SELECT): `visibility = 'employee_visible' AND can_view_employee_by_priority(auth.uid(), employee_id)`
- `service_role_all` (ALL): `auth.role() = 'service_role'`
- No insert/update/delete for employees/managers.

---

## 3. Storage Bucket

Migration creates bucket `employee-documents` with `public = false`.

**Storage policies on `storage.objects`** (bucket_id = 'employee-documents'):
- `hr_admin_all`: ALL operations for `has_admin_access(auth.uid()) OR has_hr_access(auth.uid())`
- `service_role_all`: ALL for service role
- **No direct read for employees** → all employee access goes through signed-URL edge function.

Path convention: `{employee_id}/{document_id}/{safe_filename}`.

---

## 4. Edge Functions

**A) `employee-document-upload`** (POST)
- `requireRole(['owner','admin','hr'])`
- Body (multipart or signed-upload pattern): `{ employee_id, document_type, title, description?, issue_date?, expiry_date?, visibility, file_name, file_mime_type, file_size_bytes }`
- Validates employee exists, document_type whitelist, visibility whitelist, size cap (e.g. 10 MB), mime whitelist (pdf, png, jpeg, jpg, webp, heic).
- Inserts row → returns `{ document_id, upload_url }` using **Supabase Storage signed upload URL** (`createSignedUploadUrl`) so the file goes browser→Storage directly via the short-lived URL.
- Writes audit log: `action_type='upload', resource_type='employee_document'`.

**B) `employee-document-signed-url`** (POST `{ document_id }`)
- Auth check:
  - admin/hr/owner → allowed
  - manager → allowed only if `visibility='employee_visible'` AND `can_view_employee_by_priority`
  - employee → allowed only if `visibility='employee_visible'` AND owns the doc
- Returns 60-second signed download URL.
- Writes audit log: `action_type='view'`.

**C) `employee-document-archive`** (POST `{ document_id, reason? }`)
- `requireRole(['owner','admin','hr'])`
- Sets `status='archived'`, `archived_at=now()`, `archived_by_user_id`. Does NOT delete file.
- Audit log: `action_type='archive'`.

**D) `employee-document-replace`** (POST) — convenience wrapper: marks old doc `status='replaced'`, sets `replaced_by_document_id` after the new doc is uploaded. Audit log: `action_type='replace'`.

All four functions: `verify_jwt = false` is the project default; we validate JWT in code via `requireRole`. CORS headers on every response.

**Why edge functions for upload + read**: Direct Storage RLS for employees is complex (need to map storage path → employee_id → visibility). Edge functions centralize the policy and give us auditing for free. Admin/HR could go direct, but unified path keeps audit consistent.

---

## 5. Admin UI

**A) Employee Detail integration** (`src/pages/attendance/EmployeeDetail.tsx`)
- New `<TabsTrigger value="documents">เอกสาร</TabsTrigger>` (visible only if `canManageEmployee` OR own profile)
- New component `src/components/employee-documents/EmployeeDocumentsTab.tsx`:
  - List with: title, type chip, file name, uploaded date, issue date, expiry date (red if expired/<30 days), status badge, visibility badge.
  - Actions: View/Download (calls signed-url fn), Archive, Replace.
  - "Upload" button opens dialog → form (type, title, desc, issue/expiry, visibility, file picker) → calls upload fn → uses returned signed upload URL → PUT file → toast success.
  - Filters: type, status (default hide archived).

**B) Cross-employee admin page** `src/pages/attendance/EmployeeDocuments.tsx`
- Route: `/attendance/employee-documents` (lazy in `App.tsx`, nav entry in `DashboardLayout.tsx` under HR section).
- Table across all employees with filters: employee search, branch, type, status, expiring window (all / expired / 30d / 60d / 90d).
- Click row → navigate to employee detail with documents tab.

UI: shadcn/ui (Card, Table, Dialog, Select, Badge, Tabs), Tailwind, Thai-first labels (เอกสารพนักงาน, ประเภทเอกสาร, วันหมดอายุ, อัปโหลดโดย, มองเห็นโดยพนักงาน, เก็บถาวร, แทนที่ด้วยเอกสารใหม่).

**Document type labels** (Thai): สัญญาจ้าง, สำเนาบัตรประชาชน, สำเนาทะเบียนบ้าน, สำเนาสมุดบัญชี, ใบอนุญาตทำงาน, ประกาศนียบัตร, หนังสือเตือน, เอกสารทดลองงาน, หนังสือปรับเงินเดือน, ใบลาออก, อื่นๆ — centralized in `src/lib/employee-document-types.ts`.

---

## 6. Expiry Foundation

- Cross-employee admin page filters by `expiry_date` window (≤today, ≤+30d, ≤+60d, ≤+90d).
- Add SQL view `employee_documents_expiring` (active docs with non-null expiry_date, ordered by expiry) — read-only for HR.
- **No cron / no notifications yet** — explicit follow-up in Phase 1B.

---

## 7. Audit Logging

Use existing `writeAuditLog` in all four edge functions. Metadata: `employee_id, document_id, document_type, visibility, file_size_bytes, expiry_date, actor_role`. Never log file URL, signed URL, or file content.

---

## 8. Security Checklist (verified post-implementation)

- Bucket private ✓
- Employee cannot SELECT hr_only docs (RLS) ✓
- Employee cannot SELECT another employee's docs ✓
- Manager limited by `can_view_employee_by_priority` + `employee_visible` only ✓
- Signed URLs expire in 60s ✓
- Archived docs filtered out of default lists ✓
- Audit row written on upload/view/archive/replace ✓

---

## 9. Tests

- `npm run build` (auto)
- `npm run smoke:quick`
- Manual test checklist included in final report (HR upload contract, hr_only invisibility to employee, employee_visible visibility, archive flow, expiring filter, audit row presence).

---

## 10. Files to Change

**New**
- `supabase/migrations/<ts>_employee_documents.sql` (table + RLS + bucket + storage policies + view)
- `supabase/functions/employee-document-upload/index.ts`
- `supabase/functions/employee-document-signed-url/index.ts`
- `supabase/functions/employee-document-archive/index.ts`
- `supabase/functions/employee-document-replace/index.ts`
- `src/components/employee-documents/EmployeeDocumentsTab.tsx`
- `src/components/employee-documents/UploadDocumentDialog.tsx`
- `src/pages/attendance/EmployeeDocuments.tsx`
- `src/lib/employee-document-types.ts`

**Edited (additive only)**
- `src/pages/attendance/EmployeeDetail.tsx` — add Documents tab
- `src/App.tsx` — add `/attendance/employee-documents` route
- `src/components/DashboardLayout.tsx` — add nav entry
- `docs/STATUS.md` — Phase 1A entry

**Untouched (per absolute rules)**: line-webhook, attendance-submit, attendance-validate-token, claim_attendance_token, timezone helpers, payroll math, point ledger, portal check-in/out, existing leave/OT/attendance approval logic, `document_uploads` table.

---

## 11. Risks / Notes

- Signed upload URL pattern requires `@supabase/supabase-js` v2.x `createSignedUploadUrl` (already available).
- File size cap defaults to 10 MB — adjustable later.
- Manager scope reuses `can_view_employee_by_priority` — same semantics as existing employee visibility, so no new policy decisions.
- Phase 1B candidates: cron-based expiry reminders to LINE, e-sign workflow, OCR auto-tag for ID card / contract, employee-side upload requests.
