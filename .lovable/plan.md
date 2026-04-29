
# Phase 1A.3 — Employee Documents UX & Observability Patch

Four small, additive changes. No schema migration needed (we reuse `audit_logs` for the activity log and `employee_documents.metadata` for the per-row history). No changes to any verified attendance / Bangkok / token code paths.

## 1. Confirm-attempt activity log (HR troubleshooting)

**Backend — `supabase/functions/employee-document-confirm-upload/index.ts`**
- Already writes to `audit_logs` on success / explicit failure. Add a third `actionType: "upload_pending_check"` entry whenever Storage `list()` returns no object (the `file_missing` 410 branch) so HR sees every retry attempt, not just the terminal ones.
- Stamp every audit row with `metadata.attempt_at` (ISO Bangkok time via the existing timezone helper) and `metadata.outcome` ∈ `uploaded | failed | file_missing`.
- Mirror the same outcome inside `employee_documents.metadata.confirm_history` (append-only, capped at the last 20 entries) so the per-document drawer can render history without a cross-table join. Each entry: `{ at, outcome, reason?, by_user_id }`.

**Frontend — new `DocumentActivityLogDialog.tsx`**
- Triggered from a new “ดูประวัติการยืนยัน” icon in `EmployeeDocumentsTab` row actions (only shown when `metadata.confirm_history?.length > 0` or `upload_status !== 'uploaded'`).
- Renders a simple table: timestamp (Bangkok), outcome badge (pending / uploaded / failed / file_missing), reason. Reads straight from `metadata.confirm_history`; no extra query.
- Add a small Thai legend explaining each outcome.

## 2. Integration test: picker → URL param → auto-open

**New file** `src/pages/attendance/__tests__/employee-documents-picker.test.tsx`
- Renders `EmployeeDocuments` (list page) inside `MemoryRouter` + `QueryClientProvider`.
- Mocks `supabase` (extends `test-utils.ts` to support the `employees` select used by `SelectEmployeeForUploadDialog`).
- Mocks `react-router-dom`'s `useNavigate` to capture the target URL.
- Steps:
  1. Click “อัปโหลดเอกสาร”.
  2. Assert the picker dialog appears.
  3. Click the first employee.
  4. Assert `navigate` was called with `/attendance/employees/<id>?action=upload-document`.
- Second test: render `EmployeeDocumentsTab` with `autoOpenUpload={true}` and assert the upload dialog header (“อัปโหลดเอกสารพนักงาน”) appears and `onAutoOpenConsumed` fires exactly once (regression guard against re-open loops).

`test-utils.ts` gets a tiny extension: `queueSelect` already returns the next queued payload regardless of table, so we just queue the employee list. No structural changes.

## 3. Upload progress indicator + action locking

**`UploadDocumentDialog.tsx`**
- Replace the binary `busy` flag with a `phase` state: `idle | uploading | confirming | done`.
- Compute progress with the `XMLHttpRequest` path used by `uploadToSignedUrl` is opaque, so we drive a deterministic two-step `<Progress>` bar:
  - 0–80% during `uploading` (animated indeterminate stripes via existing shadcn `Progress` with `value={undefined}` style),
  - 80–100% during `confirming`.
- Disable the “อัปโหลด” button, the file input, and the close (`X` / outside click) handler in both phases (already wired through `busy` — extend to `phase !== 'idle'`).
- Show inline status text: “กำลังอัปโหลดไฟล์…” / “กำลังยืนยัน…”.

**`EmployeeDocumentsTab.tsx`**
- While `uploadOpen` is true OR a row’s `upload_status === 'pending'`, disable that row’s Download, Replace, and Archive buttons (`disabled` + `title="กำลังประมวลผล…"`).
- Track a local `confirmingIds: Set<string>` if we add a manual “Retry confirm” button later (out of scope for this patch, but the lock primitive is in place).

## 4. Client-side type/size validation gate

**`employee-document-types.ts`**
- Add `ALLOWED_EXTENSIONS = ['.pdf','.png','.jpg','.jpeg','.webp','.heic','.heif']`.
- Add helper `validateDocumentFile(file): { ok: true } | { ok: false; reason: string }` that checks both MIME (already there) and extension fallback (HEIC on Safari often comes through as empty MIME). Returns Thai reason strings.
- Export a single `ALLOWED_TYPES_LABEL_TH = "PDF, JPG, PNG, WebP, HEIC"` for UI reuse.

**`UploadDocumentDialog.tsx`**
- Above the file input, render a small muted line: `รองรับ: {ALLOWED_TYPES_LABEL_TH} • สูงสุด 10MB` so users see the rule before picking.
- Run `validateDocumentFile` on selection AND again right before `submit()` invokes `employee-document-upload`. If invalid, abort *before* requesting the signed URL — this prevents creating an orphan `pending` row from a doomed upload.
- Disable the “อัปโหลด” button until a valid file + non-empty title are present (already enforced; extend to also block when validation result is not `ok`).

## Files touched

- `supabase/functions/employee-document-confirm-upload/index.ts` (audit + metadata.confirm_history)
- `src/lib/employee-document-types.ts` (validator + label)
- `src/components/employee-documents/UploadDocumentDialog.tsx` (phases, progress, validation gate, allowed-types hint)
- `src/components/employee-documents/EmployeeDocumentsTab.tsx` (action lock, activity log button wiring)
- `src/components/employee-documents/DocumentActivityLogDialog.tsx` (NEW)
- `src/pages/attendance/__tests__/employee-documents-picker.test.tsx` (NEW)
- `src/components/employee-documents/__tests__/test-utils.tsx` (tiny extension only)
- `docs/STATUS.md` (Phase 1A.3 entry)

## Regression checklist

- `bun run test` → existing 5 tests still pass + 2 new tests pass.
- Manual: upload a `.txt` → blocked client-side, no `employee-document-upload` invoke.
- Manual: upload a valid PDF → see progress bar transition uploading → confirming → success badge.
- Manual: open a row’s activity log → see at least one `uploaded` entry with Bangkok timestamp.
- Manual: while uploading, Download/Replace/Archive buttons on other pending rows are disabled.
- No changes to `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, RLS policies, or DB schema.

## Verdict after patch

System remains **READY FOR PHASE 1B PERFORMANCE**; this patch is purely additive observability + UX hardening on top of Phase 1A.2.
