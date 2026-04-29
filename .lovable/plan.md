## Two Goals

### A. UX Fix — "ผมไม่เห็นปุ่มอัพโหลด"

**Root cause** (verified by reading code):
- `EmployeeDocumentsTab.tsx` (the per-employee tab on `/attendance/employees/:id`) **does** have the "อัปโหลดเอกสาร" button at line 143–145.
- The standalone HR list page at `/attendance/employee-documents` is **read-only** — no upload button, no employee picker, just a table. Users landing here expect to upload but cannot.

**Why we won't put a global "upload" button blindly:** uploads must be scoped to an employee. The fix gives users a clear path from the list page to the right employee.

**Minimal, additive changes to `src/pages/attendance/EmployeeDocuments.tsx`:**
1. Add a header-right action group with:
   - **"อัปโหลดเอกสาร"** primary button → opens an employee picker dialog (search by name) → on select, navigates to `/attendance/employees/:id` and auto-opens the upload dialog (via `?action=upload-document` query param).
   - Keep existing per-row "ดูพนักงาน" link.
2. New small component `SelectEmployeeForUploadDialog.tsx` (search + list, reuses `employees` query, filters `is_active=true`).
3. Update `EmployeeDetail.tsx` to read `?action=upload-document` on mount and trigger `EmployeeDocumentsTab` to open its dialog. Pass an optional `autoOpenUpload?: boolean` prop into `EmployeeDocumentsTab`; consume it in a `useEffect` to set `setUploadOpen(true)` once.
4. Add a small inline empty-state CTA inside the table when `rows.length === 0`: "เลือกพนักงานเพื่ออัปโหลดเอกสาร" → opens the same picker.

No changes to RLS, edge functions, or schema.

### B. E2E Test Flow — upload → confirm → signed URL → badge

**Approach:** Vitest + jsdom integration test that drives the React UI with mocked Supabase client + `supabase.functions.invoke` + `storage.from(...).uploadToSignedUrl`. We do not call real LINE/cron/attendance code. This matches the existing `vitest` setup.

**File:** `src/components/employee-documents/__tests__/upload-flow.test.tsx`

**Scenarios covered:**
1. **Happy path**
   - Mock `employee-document-upload` → returns `{ document_id, file_path, upload_token }` with row state `pending`.
   - Mock `storage.uploadToSignedUrl` → success.
   - Mock `employee-document-confirm-upload` → returns `{ success, upload_status: 'uploaded' }`.
   - Mock follow-up `from('employee_documents').select` → row now has `upload_status: 'uploaded'`.
   - Assert: success toast, no "ยังอัปโหลดไม่เสร็จ" badge, action shows the **Download** button (signed URL flow available).
2. **Signed URL after confirm**
   - Click download → mock `employee-document-signed-url` returns `{ success: true, signed_url: 'https://...' }`.
   - Assert `window.open` called with the signed URL.
3. **Upload succeeds but confirm fails (file_missing)**
   - Mock confirm → `{ success: false, error: 'file_missing' }`, refetched row → `upload_status: 'failed'`.
   - Assert: destructive badge "อัปโหลดล้มเหลว", Download button hidden / disabled, error toast text from `SIGNED_URL_ERROR_CODE_TH`.
4. **Pre-confirm intermediate state**
   - Between upload and confirm, row state = `pending`.
   - Assert badge "ยังอัปโหลดไม่เสร็จ" (outline variant) and download disabled.
5. **Signed URL on a `pending` row returns 409 `not_yet_uploaded`**
   - Click download → mock returns `{ success: false, error: 'not_yet_uploaded' }`.
   - Assert: Thai error toast "เอกสารยังอัปโหลดไม่เสร็จ", row stays `pending`, no `window.open`.

**Helpers:**
- `src/components/employee-documents/__tests__/test-utils.tsx`: small wrapper that renders `EmployeeDocumentsTab` inside `QueryClientProvider`, plus a `mockSupabase()` factory that lets each test queue `from(...).select` results and `functions.invoke(name)` results.
- Mock `sonner` `toast` to capture calls.
- Mock `window.open`.

**No new deps.** Uses existing `vitest`, `@testing-library/react`, `@testing-library/jest-dom`.

### Files Changed

**UX fix (additive):**
- `src/pages/attendance/EmployeeDocuments.tsx` — add header upload button + empty-state CTA, wire dialog.
- `src/components/employee-documents/SelectEmployeeForUploadDialog.tsx` — new picker.
- `src/components/employee-documents/EmployeeDocumentsTab.tsx` — accept `autoOpenUpload?: boolean` prop, open dialog once on mount when true.
- `src/pages/attendance/EmployeeDetail.tsx` — read `?action=upload-document`, pass through to tab.

**Tests (new):**
- `src/components/employee-documents/__tests__/test-utils.tsx`
- `src/components/employee-documents/__tests__/upload-flow.test.tsx`

**Docs:**
- `docs/STATUS.md` — append Phase 1A.2 note (UX entry point + E2E test coverage).

### What Will NOT Be Touched
- `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, Bangkok timezone code.
- RLS policies, storage bucket policies.
- The 4 edge functions for documents (logic unchanged).
- Database schema.

### Regression Checklist
- Per-employee tab upload button still works exactly as before (button still rendered at the same place).
- Filters and table on `/attendance/employee-documents` unchanged in shape and behavior.
- No new query that bypasses RLS.
- `npm run build`, `npm run smoke:quick`, and `vitest run` all pass.
- Manual: open `/attendance/employee-documents` → see upload button → pick employee → upload dialog opens on detail page → upload + confirm → row shows `uploaded` and download works.

### Verdict After Implementation
If all green → **READY FOR PHASE 1B PERFORMANCE**.
