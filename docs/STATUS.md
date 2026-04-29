# Project Status — LINE Intern

_Last updated: 2026-04-29 (Phase 0B complete — full audit coverage, role-priority enforcement, RLS pass)_

## Product positioning

LINE-first HR Operations app for Thai SMEs. The LINE bot is the primary
surface for employees (check-in/out, leave, OT, points, receipts), and the
web admin/portal is the secondary surface for managers, HR, and owners.
Bilingual Thai/English. Asia/Bangkok timezone is canonical.

## Module status snapshot

**Confirmed strong**
- Attendance core: token issuance, claim, geofence, photo, fraud signals.
- Bangkok timezone helpers (`_shared/timezone.ts`) and `formatBangkokISODate`.
- LINE webhook routing and command parser.
- Happy Points earn flows (attendance, response, streak).
- Receipt OCR + approval flex flow.
- Cross-group AI query with role-aware policy.
- Portal data fetcher (`portal-data`) with internal RLS bypass.

**Partial**
- Permissions UI: DB-backed but historically over-permissive; tightened in Phase 0A.
- Audit logging: structured for 7 Phase 0A.1 functions + `point-redemption`,
  `liff-settings`, `admin-response-points-rollback`, `fix-user-names`,
  `backfill-primary-groups` in 0A.2 + Phase 0B closes the remaining 6:
  `payslip-generator`, `payroll-notification`, `backfill-work-sessions`,
  `backfill-work-sessions-time-based`, `branch-report-backfill`,
  `report-generator` (manual path only — `auto_summary` cron is intentionally not audited).
- Payroll: calculation logic works but spread across SQL + frontend; not modularized.
- Receipts/Deposits admin menus: surfaces exist but business flows are not fully implemented.
- Notifications center: real-time wiring works; preferences UI partial.

**Missing (HRIS gaps for Phase 1+)**
- Org chart / reporting hierarchy.
- Document store (contracts, ID cards, certificates).
- Performance review cycle.
- Leave-policy engine (accrual, carry-over rules).
- Payslip PDF templating.
- Onboarding/offboarding workflow.

---

## Phase 0A — Edge Function Hardening (complete)

Role guards via `_shared/authz.ts` + structured audit logs via `_shared/audit.ts`
on the following 7 edge functions. All audit rows land in `public.audit_logs`
with `metadata.function`, `metadata.caller_role`, and function-specific context.

| Function                          | Allowed roles                                         | Audit action |
|-----------------------------------|--------------------------------------------------------|--------------|
| `remote-checkout-approval`        | admin, owner, hr, manager, executive (+ internal)     | approve / archive / reject |
| `streak-backfill`                 | admin, owner                                          | backfill |
| `response-analytics-backfill`     | admin, owner                                          | backfill |
| `memory-backfill`                 | admin, owner                                          | backfill |
| `dm-send`                         | admin, owner, hr, manager, moderator                  | send |
| `broadcast-send`                  | admin, owner, hr                                      | send |
| `import-line-chat`                | admin, owner, hr, manager, executive                  | import |

Additional guarded functions (role check only, no audit yet):
`admin-response-points-rollback`, `payslip-generator`, `payroll-notification`,
`report-generator` (skips guard for `type='auto_summary'` from line-webhook),
`backfill-primary-groups`, `backfill-work-sessions`,
`backfill-work-sessions-time-based`, `branch-report-backfill`, `fix-user-names`.

### Internal-call contract — `remote-checkout-approval`

The only function that supports internal (non-user-JWT) calls. Used by
`portal-data` for portal-driven approvals.

Required headers:
- `x-internal-source: portal-data`
- `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (constant-time compared)

Half-set markers return `401 { code: "internal_marker_mismatch" }`.
Internal calls write audit rows with `metadata.caller_role='internal:portal-data'`
and `metadata.source='internal'`; the human approver is preserved in
`performed_by_employee_id`.

### Phase 0A change log (2026-04-29)

1. **Frontend regression fix** — `src/pages/branch-reports/components/BranchReportImport.tsx`
   was sending the publishable anon key as the bearer to `import-line-chat`.
   After the role guard was added this would 401 for every user. Switched to
   `supabase.functions.invoke()` so the user's JWT is auto-attached. No
   business logic change.
2. **Permission lockdown migration** — additive UPDATE only, no DELETE.
   Flipped `can_access` from true → false on the role/page combinations below.
   Owner and admin are never touched.

### Permission lockdown — before/after

| role      | pages_allowed before | pages_allowed after |
|-----------|---------------------:|--------------------:|
| owner     | 65 | 65 |
| admin     | 65 | 65 |
| hr        | 48 | 39 |
| manager   | 51 | 34 |
| executive | 52 | 31 |
| moderator | 51 | 31 |
| user      | 51 | 31 |
| field     |  7 |  7 |
| employee  |  0 |  0 |

Risky-page residuals (intentional) after lockdown:
- `hr` keeps: `/attendance/payroll`, `/attendance/payroll-ytd`,
  `/attendance/happy-points`, `/attendance/point-transactions`,
  `/attendance/redemption-approvals`, `/broadcast`, `/direct-messages`.
- `manager` keeps: `/attendance/happy-points`,
  `/attendance/point-transactions`, `/attendance/redemption-approvals`.
- All other risky pages (`/bot-logs`, `/test-bot`, `/cron-jobs`,
  `/health-monitoring`, `/config-validator`, `/integrations`, `/safety-rules`,
  `/training`, `/memory`, `/memory-analytics`, `/personality`, `/analytics`,
  `/settings`, `/settings/reports`) are now admin/owner-only.

Menu groups `Monitoring & Tools`, `AI Features`, `Configuration`, and
`Content & Knowledge` are now admin/owner-only so empty sections do not render.

---

## Phase 0A.2 — Point-redemption hardening + audit retention (2026-04-29)

### 1. `point-redemption` — RESOLVED (was P1)

`supabase/functions/point-redemption/index.ts` now requires a valid user JWT
on every action and enforces ownership / role per action:

| Action group | Allowed callers | Enforcement |
|---|---|---|
| `redeem`, `redeem_to_bag`, `use_bag_item`, `gacha_pull` | Any authenticated user with a linked `employees` row | `body.employee_id` MUST equal `caller.employee_id` (resolved via `employees.auth_user_id`). Mismatch → 403 `forbidden_employee_mismatch`. No employee link → 403 `no_employee_link`. |
| `approve`, `reject`, `use` | `admin`, `owner`, `hr`, `manager` | Role check via `requireRole(strict:false)` + role allow-list. |

Every successful action writes a structured `audit_logs` row with
`metadata.function='point-redemption'`, the action name, target employee,
reward / bag item id, points spent, new balance, and the caller's role.
`gacha.ts` was not modified — audit happens in `index.ts` after `gachaPull`
returns. No frontend wiring change was needed (all 4 callers already use
`supabase.functions.invoke`, which auto-attaches the user JWT).

### 2. `liff-settings` — guarded + audited

Backend now requires `admin` or `owner` for both `get` and `update-endpoint`.
Frontend (`src/components/settings/LiffSettingsCard.tsx`) was switched from
publishable-key-only fetches to authed fetches that attach the signed-in
user's bearer token. Both actions write audit rows.

### 3. Audit-logs retention — LIVE

- New SQL function `public.cleanup_audit_logs(retention_days int default 180)`
  (`SECURITY DEFINER`, `search_path=public`). Returns deleted row count and
  records its own cleanup as an audit row.
- Cron job `audit-logs-cleanup-daily` runs `SELECT public.cleanup_audit_logs(180);`
  every day at `15 17 * * *` UTC = 00:15 Asia/Bangkok.
- Retention window: **180 days**. Rationale: covers two quarterly review
  cycles + a monthly audit; current audit categories (approvals, backfills,
  sends, redemptions) are operational, not legal/financial — no statutory
  minimum applies. Rows that need longer retention must be exported to a
  separate archive table before the cron runs.
- Manual override: `SELECT public.cleanup_audit_logs(<days>);` (service role
  or authenticated DB user only — `anon` is revoked).

### 4. Frontend raw-fetch + publishable-key inventory

Three files use raw `fetch` with `VITE_SUPABASE_*_KEY`:

| File | Risk | Action |
|---|---|---|
| `src/pages/Attendance.tsx` (7 sites) | **Low — accepted.** Token-gated unauthenticated check-in page; users are not logged into Supabase Auth, so the anon-key bearer is the intended boundary. The one-time attendance token is the real auth control. | None. |
| `src/lib/offline-queue.ts` (2 sites) | Same as above — runs from the same token-gated page. | None. |
| `src/components/settings/LiffSettingsCard.tsx` (2 sites) | **High — fixed.** Admin-dashboard component; previously authed only with the publishable key. | Now sends user JWT + publishable key as `apikey`. Backend rejects non-admins. |

### 5. Audit-coverage backfill (partial)

`writeAuditLog` added to `admin-response-points-rollback`, `fix-user-names`,
`backfill-primary-groups`. Remaining role-guarded functions still pending
audit (deferred — see Phase 0B queue): `payslip-generator`, `payroll-notification`,
`backfill-work-sessions`, `backfill-work-sessions-time-based`,
`branch-report-backfill`, `report-generator` (manual path only — never the
`auto_summary` cron path).

---

## Known risks (post-0A.2)

- **Receipts / Deposits admin menus** still visible to non-admins because
  removing them would also affect portal references. Deferred until the
  receipts/deposits admin flows are either implemented or formally deprecated.
- **Payroll calculation logic** (Payroll.tsx, payslip-generator math) was
  not touched. Still works as before — but no test coverage.
- **LINE webhook core** (`line-webhook/index.ts`) was not modified.
- 6 guarded functions still lack audit writes (see #5 above).

---

## Protected — DO NOT modify without explicit approval

- `supabase/functions/line-webhook/**` (the entire 11K-line monolith).
- `supabase/functions/_shared/timezone.ts` and any `formatBangkokISODate`
  / `getBangkokDateString` helpers.
- `public.claim_attendance_token` SQL function.
- `supabase/functions/attendance-submit/**` and `attendance-validate-token/**`.
- Payroll calculation math in `Payroll.tsx`, `payslip-generator/index.ts`,
  `payroll-notification/index.ts`.
- `src/pages/Attendance.tsx` and `src/lib/offline-queue.ts` raw-fetch sites
  (token-gated, intentional).
- Any function or component carrying a `// ⚠️ VERIFIED` comment.

---

## Phase 0B — Audit completion + role-priority + RLS pass (2026-04-29)

All four queued items resolved. See `docs/PHASE_0B_SECURITY_REPORT.md`
for the full report (file list, decision matrix, manual test checklist,
audit-row spot-check SQL, and Phase 1 readiness verdict).

1. **Audit backfill complete** on 6 remaining guarded functions
   (`payslip-generator`, `payroll-notification`, `backfill-work-sessions`,
   `backfill-work-sessions-time-based`, `branch-report-backfill`,
   `report-generator` manual path only). Pattern: capture `userId`/`role`
   from `requireRole`, write one best-effort `writeAuditLog` before the
   success-path return. Counts/IDs only — no salaries, no raw payloads,
   no LINE tokens, no photo URLs.
2. **`remote-checkout-approval` role-priority enforced** on both call
   paths. admin/owner bypass; otherwise approver priority must be ≥
   target priority. Internal portal-data path resolves approver
   priority from `approver_employee_id → employee_roles.priority`.
   Block returns `403 forbidden_role_priority` and writes a `denied`
   audit row.
3. **Points RLS reviewed.** All point/redemption/gacha tables already
   correctly scoped. **One missing policy added** —
   `Employees can view own bag items` SELECT on `employee_bag_items`
   (Reward Shop bag count was silently 0 for non-admin employees). No
   new mutation surface.
4. **Notifications RLS reviewed.** No changes needed — own-read,
   admin-all-read, admin-insert (service-role bypass for edge writers),
   own-update; no DELETE policy by design.

### Phase 0B candidates (carried out)

✅ Done. Phase 0B is closed. Next phase = HRIS expansion (Phase 1).

## Phase 1 candidates (HRIS expansion, after 0B)

1. Org chart / reporting-line table.
2. Employee document store (contracts, IDs, certificates) using Storage.
3. Leave-policy engine (accrual, carry-over, blackout dates).
4. Performance review cycle (templates, cycles, sign-off).
5. Payslip PDF templating + email/LINE delivery.
6. Onboarding / offboarding checklists wired to existing tasks system.
7. Time-off calendar UI for managers.

---

## Verification

See `docs/PHASE_0A_VERIFICATION.md` for the full curl-based test matrix and
audit-log spot-check SQL for the 7 hardened functions.

## Phase 1A — Employee Documents Module (2026-04-29)

**Status: COMPLETE**

- New table `public.employee_documents` (RLS: HR/Admin manage; employees see own employee_visible non-archived; managers see scoped employee_visible).
- New private storage bucket `employee-documents` (HR/Admin direct; others via signed-URL edge function).
- New edge functions: `employee-document-upload`, `employee-document-signed-url`, `employee-document-archive`, `employee-document-replace`.
- New view `employee_documents_expiring` (security_invoker).
- Admin UI: Documents card on EmployeeDetail + cross-employee page at `/attendance/employee-documents`.
- Audit logs written for upload/view/archive/replace.
- Smoke: 11 pass / 0 fail / 5 skip (unchanged baseline).

## Phase 1A QA Patch (2026-04-29)

**Status: COMPLETE — READY FOR PHASE 1B**

### Build / smoke
- `npm run build`: passes (harness build verified — JSX, imports, types compile).
- `npm run smoke:quick`: 11 pass / 0 fail / 5 skip (unchanged baseline).

### EmployeeDetail JSX verification
- Import on line 31 OK: `import { EmployeeDocumentsTab } from '@/components/employee-documents/EmployeeDocumentsTab'`.
- JSX comment on line 688 is **valid** (`{/* Phase 1A — Employee Documents */}`); the malformed `{/ ... /}` form does not exist.
- Tab guarded by `id && canManageEmployee`.

### signed-url ownership query — FIXED
File: `supabase/functions/employee-document-signed-url/index.ts`.

**Before:** `.or("auth_user_id.eq.${uid},line_user_id.in.(select line_user_id from users where id = '${uid}')")`
PostgREST does not evaluate SQL subqueries inside `.or()`, so the LINE-only branch silently never matched. Employees linked only via LINE could not read their own visible docs.

**After:** two-step lookup —
1. `users.line_user_id` resolved by `auth.userId`.
2. `employees` filtered with `id = doc.employee_id` AND (`auth_user_id = uid` OR `line_user_id = resolvedLineId`), with the LINE branch only added when a LINE id exists.

Invariants preserved (and re-checked):
- Non-HR cannot fetch `hr_only` (early visibility gate).
- Employee A cannot fetch employee B docs (`id = doc.employee_id` is always pinned).
- Manager / executive / moderator still gated by `can_view_employee_by_priority` RPC.
- HR / Admin / Owner short-circuit unchanged.
- No raw SQL, no string-built subquery, no injection surface.

### Upload-failure behavior — DEFERRED to Phase 1A.1 (documented risk)
If the browser dies between metadata insert and signed-URL upload, an `employee_documents` row exists with no Storage object. Decision: do **not** patch in this QA pass.

- Not a security issue: orphan rows default to `hr_only`; signed-URL fetch returns clean "file not found".
- Existing rollback already deletes the row when *signed URL creation itself* fails.
- Adding `upload_status` would touch schema + 3 edge fns + 2 UIs — outside QA-patch scope.

**Phase 1A.1 plan (next slice, not now):**
- `ALTER TABLE employee_documents ADD COLUMN upload_status text NOT NULL DEFAULT 'pending'` (`pending|uploaded|failed`).
- New `employee-document-confirm-upload` (HR/Admin/Owner) verifies Storage object exists then sets `uploaded`.
- List queries filter `upload_status = 'uploaded'`.
- Daily cron deletes `pending` rows older than 24 h.

### Manual security checklist (to run on staging)
1. HR uploads `hr_only` contract → row + object created, `audit_logs` `upload`.
2. HR fetches signed URL → 200, `audit_logs` `view`.
3. Employee A requests `hr_only` → 403 (visibility gate).
4. Employee A requests own `employee_visible` → 200 (works for both auth-linked and LINE-only after fix).
5. Employee B requests A's `employee_visible` → 403 (employee_id pin).
6. In-scope manager requests `employee_visible` → 200 via priority RPC.
7. Manager requests `hr_only` → 403.
8. Archived doc hidden from default tab list and from employee/manager RLS.
9. Replace: old row → `status='replaced'`, `replaced_by_document_id` set; new row active.
10. `audit_logs` rows present for all of upload / view / archive / replace.

### Files changed
- `supabase/functions/employee-document-signed-url/index.ts` (ownership query hardening)
- `docs/STATUS.md` (this section)

### Remaining risks
- Phase 1A.1 (upload confirm + cleanup cron) — non-blocking, documented above.
- Manual staging walkthrough of the 10-item checklist still recommended before broad HR rollout.

### Verdict
**READY FOR PHASE 1B PERFORMANCE.**

## Phase 1A.1 — Upload Confirm + Clearer Errors (2026-04-29)

**Status: COMPLETE**

### Schema
- Added `employee_documents.upload_status text NOT NULL DEFAULT 'pending'` with check constraint `('pending','uploaded','failed')` and supporting index.
- Backfilled all pre-existing rows to `'uploaded'`.
- Updated employee + manager SELECT policies to require `upload_status='uploaded'` so non-HR users never see orphan rows. HR/Admin/Owner keep full visibility for cleanup.
- Rebuilt `employee_documents_expiring` view with the same filter.

### New edge function
- `employee-document-confirm-upload` (HR/Admin/Owner): given `{document_id}`, lists the parent folder in the `employee-documents` bucket, verifies the filename exists, and flips `upload_status` to `uploaded`. Body `{document_id, failed:true, failure_reason}` marks the row `failed` for HR cleanup. Audits `upload_confirmed` / `upload_failed`.

### Updated edge function — `employee-document-signed-url`
Structured error codes (HTTP):
- `not_found` (404) — missing doc row
- `forbidden_visibility` (403) — non-HR tried to fetch hr_only
- `forbidden_scope` (403) — caller not owner/in-scope
- `not_yet_uploaded` (409) — `upload_status='pending'`
- `upload_failed` (410) — `upload_status='failed'`
- `file_missing` (410) — Storage object gone (auto-flips row to `failed`)
- `storage_error` (502) — signing call failed

Audit logs now include `error_code` on failure paths.

### UI
- `UploadDocumentDialog` calls the confirm endpoint after successful Storage upload. On any failure (upload OR confirm), invokes confirm with `failed:true, failure_reason` so HR sees the failed row immediately.
- `EmployeeDocumentsTab`:
  - New `upload_status` badge column (only visible when not `uploaded`).
  - Status filter gains `pending_or_failed` for HR cleanup.
  - Pending/failed rows show "ยังอัปโหลดไม่เสร็จ" / "อัปโหลดล้มเหลว" instead of a download icon; the existing Archive button doubles as "ลบรายการที่ค้าง".
  - Download errors map structured codes → Thai toasts via `SIGNED_URL_ERROR_CODE_TH`.
- `EmployeeDocuments` admin page: default query restricts to `upload_status='uploaded'`; status select gains `pending_or_failed` for cross-employee cleanup.

### Untouched
- `claim_attendance_token`, attendance-submit, attendance-validate-token, line-webhook, payroll, points, leave/OT, portal check-in.
- `employee-document-archive`, `employee-document-replace`.
- HR/Admin RLS (`admin_hr_manage_all`).

### Files changed
- Migration `<ts>_employee_documents_upload_status` (column + RLS + view rebuild)
- `supabase/functions/employee-document-confirm-upload/index.ts` (new)
- `supabase/functions/employee-document-signed-url/index.ts` (structured codes + storage existence check)
- `src/lib/employee-document-types.ts` (new types + label maps)
- `src/components/employee-documents/UploadDocumentDialog.tsx`
- `src/components/employee-documents/EmployeeDocumentsTab.tsx`
- `src/pages/attendance/EmployeeDocuments.tsx`
- `docs/STATUS.md`

### Manual verification checklist
1. Upload → row `pending` → flips `uploaded` after confirm; audit `upload_confirmed`.
2. Cancel upload mid-flight → row `failed`; HR sees red badge; `upload_failed` audit.
3. HR clicks Archive on failed row → archived; hidden from default list.
4. Download `pending` row (HR) → 409 `not_yet_uploaded` → toast: "เอกสารยังอัปโหลดไม่เสร็จ — รอสักครู่หรืออัปโหลดใหม่".
5. Manually delete a Storage object → download → 410 `file_missing` → row auto-flipped to `failed` → toast: "ไฟล์หายไปจากที่จัดเก็บ".
6. Employee downloads own `uploaded` `employee_visible` doc → still works (regression).
7. Employee never sees `pending`/`failed` rows in their own list (RLS filter).

### Verdict
**READY FOR PHASE 1B PERFORMANCE.** Phase 1A.1 closed.

---

## Phase 1A.2 — Upload entry point + E2E test coverage (2026-04-29)

### Why
- HR users on `/attendance/employee-documents` reported there was no visible upload button — that page was read-only and required navigating to a specific employee first.
- Phase 1A.1 added states (`pending` / `uploaded` / `failed`) and structured signed-URL errors but had no automated regression coverage.

### What changed (additive, no schema/RLS/edge-function changes)
- `src/pages/attendance/EmployeeDocuments.tsx` — header "อัปโหลดเอกสาร" button + empty-state CTA → opens the new picker.
- `src/components/employee-documents/SelectEmployeeForUploadDialog.tsx` — new searchable employee picker (active employees only); on select navigates to `/attendance/employees/:id?action=upload-document`.
- `src/components/employee-documents/EmployeeDocumentsTab.tsx` — accepts `autoOpenUpload` + `onAutoOpenConsumed` props and opens the upload dialog once on mount.
- `src/pages/attendance/EmployeeDetail.tsx` — reads `?action=upload-document` and passes it through; clears the param after opening so a refresh doesn't re-trigger.

### E2E test coverage (Vitest + Testing Library, jsdom)
File: `src/components/employee-documents/__tests__/upload-flow.test.tsx` — 5 passing scenarios:
1. `pending` rows render the "กำลังอัปโหลด" badge and have no download button.
2. `failed` rows render the "อัปโหลดล้มเหลว" badge.
3. Downloading an `uploaded` row calls `employee-document-signed-url` and opens the returned signed URL.
4. Signed URL returning `not_yet_uploaded` triggers the Thai toast and does NOT open a window.
5. Signed URL returning `file_missing` triggers a refetch and the row reappears with `failed`.

Test infrastructure added: `vitest.config.ts`, `src/test/setup.ts`, `npm run test` script. Mocks isolate the Supabase client and `sonner` toasts; no real network.

### Files changed
- `src/pages/attendance/EmployeeDocuments.tsx`
- `src/pages/attendance/EmployeeDetail.tsx`
- `src/components/employee-documents/EmployeeDocumentsTab.tsx`
- `src/components/employee-documents/SelectEmployeeForUploadDialog.tsx` (new)
- `src/components/employee-documents/__tests__/upload-flow.test.tsx` (new)
- `src/components/employee-documents/__tests__/test-utils.tsx` (new)
- `vitest.config.ts` (new), `src/test/setup.ts` (new)
- `package.json` (test scripts + vitest devDeps)
- `docs/STATUS.md`

### Test result
`bunx vitest run` → 5/5 passed. Smoke + build still expected to pass (no production-code logic changes outside additive UI wiring).

### Verdict
**READY FOR PHASE 1B PERFORMANCE.**

---

## Phase 1A.3 — Activity log + progress + client validation (2026-04-29)

### Why
- HR needed visibility into *every* confirm attempt (not just terminal outcomes) to troubleshoot rows stuck in `pending` or repeatedly hitting `file_missing`.
- Picker → URL-param auto-open path had no automated regression coverage.
- Uploaders had no progress feedback and could trigger conflicting actions (download/replace/archive) on the same row mid-upload.
- Unsupported file types only failed *after* a signed URL was issued, leaving orphan `pending` rows behind.

### What changed (additive only — no schema migration)

**Backend — `employee-document-confirm-upload`**
- New audit `actionType: "upload_pending_check"` for the `file_missing` (410) branch so retries are observable.
- Every audit row now carries `metadata.attempt_at` (Bangkok ISO with `+07:00` offset) and `metadata.outcome` ∈ `uploaded | failed | file_missing`.
- Mirror append into `employee_documents.metadata.confirm_history` (capped at 20 most-recent entries) so the per-row activity drawer needs zero extra queries.

**Frontend**
- New `DocumentActivityLogDialog.tsx` — read-only drawer renders `confirm_history` with Bangkok timestamps, color-coded outcome badges, and a Thai legend. Triggered by a new `History` icon in the row actions (only shown when history exists or the row is non-uploaded).
- `UploadDocumentDialog.tsx` — replaced binary `busy` with `phase: idle | uploading | confirming`, added two-step `<Progress>` bar (50% uploading → 90% confirming), inline Thai status text, and explicit `disabled` on every input + the close handler while busy.
- Added inline allowed-types/size hint above the file picker (`รองรับ: PDF, JPG, PNG, WebP, HEIC • สูงสุด 10MB`).
- New `validateDocumentFile()` helper in `employee-document-types.ts` (MIME + extension fallback for Safari HEIC) — runs on file selection AND immediately before invoking `employee-document-upload`, blocking orphan-row creation for unsupported types.
- `EmployeeDocumentsTab.tsx` — Download / Replace / Archive buttons now disable while the upload dialog is open (prevents conflicting actions on the same row).

### Tests
- New integration test: picker click → asserts `navigate("/attendance/employees/<id>?action=upload-document")` and `onOpenChange(false)` fire.
- New regression test: `EmployeeDocumentsTab` mounted with `autoOpenUpload={true}` → upload dialog opens AND `onAutoOpenConsumed` fires exactly once (guards against re-open loops).
- `bun run test` → **7/7 passed** (5 existing + 2 new).

### Files touched
- `supabase/functions/employee-document-confirm-upload/index.ts`
- `src/lib/employee-document-types.ts`
- `src/components/employee-documents/UploadDocumentDialog.tsx`
- `src/components/employee-documents/EmployeeDocumentsTab.tsx`
- `src/components/employee-documents/DocumentActivityLogDialog.tsx` (new)
- `src/components/employee-documents/__tests__/upload-flow.test.tsx` (extended)
- `docs/STATUS.md`

### Verdict
**READY FOR PHASE 1B PERFORMANCE.** Pure additive observability + UX hardening on top of Phase 1A.2 — no changes to attendance, Bangkok helpers, RLS policies, or DB schema.
