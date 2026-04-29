# Phase 0A — Ground Truth + Safety Hardening

**Mode:** Read-only audit complete. This is the implementation plan for Phase 0A. No code changes have been made yet. All proposed changes are additive, low-risk, and reversible.

---

## 1. Executive Summary

The app is a mature LINE-native HR platform (Ultra HR / LINE Intern). Core systems (LINE webhook, attendance, points, RLS helpers, Bangkok TZ) are working and **must not be touched** in this phase. The audit found three concrete and serious safety problems that warrant minimal, surgical fixes now:

1. **Massive over-permissioning of admin pages.** Sensitive admin pages (Payroll, Bot Logs, Cron Jobs, Broadcast, Direct Messages, Memory, Personality, Test Bot, Settings, Health Monitoring) currently grant `can_access=true` to roles `manager`, `executive`, `moderator`, and `user` in `webapp_page_config`. The `Payroll` menu group is `true` for **every non-employee role including `field`**. This is a real privilege issue, not theoretical.
2. **Sensitive Edge Functions have no in-code role check.** Many service-role-keyed functions (`payslip-generator`, `payroll-notification`, `report-generator`, `backfill-primary-groups`, `backfill-work-sessions*`, `admin-response-points-rollback`, `remote-checkout-approval`, `point-redemption`, `instant-ot-grant`, `report-generator`, `fix-user-names`, etc.) rely only on the platform default `verify_jwt`, so any authenticated user (including `employee`) can invoke them.
3. **Dead "Receipts" / "Deposits" menu groups.** They exist in `webapp_menu_config` for almost every role, but there are zero `/receipts` or `/deposits` routes in `App.tsx`, zero `receipt_*` / `deposit_*` tables in the DB (only `document_uploads` exists), and they are not in the sidebar. They are confusing residue from a removed feature.

Two things flagged in the previous audit are **not actually broken** and should be left alone:
- Both attendance triggers (`prevent_duplicate_attendance` → `enhanced_prevent_rapid_attendance`, and `trg_prevent_rapid_attendance` → `prevent_rapid_attendance`) are attached. They do the same thing with the same 30-second window. They are redundant but **not in conflict** (both raise `23505` and both check the identical condition; the first to fire raises and the second never runs). Recommendation: leave as-is in Phase 0A, document only.
- Webhook, attendance token flow, `claim_attendance_token`, RLS helpers, `point_transactions` ledger — all intact. Do not touch.

---

## 2. What Will Be Changed in Phase 0A

All changes are additive / least-privilege tightening. No table renames, no business logic changes, no large refactors.

### 2A. Permission lockdown (DB migration — additive UPDATEs only)

Single migration file. Updates only `webapp_menu_config` and `webapp_page_config` rows that already exist. Pattern: lower `can_access` from `true` → `false` for roles that should never have seen these menus. **Owner and Admin are not changed anywhere.** HR is preserved on payroll/employee data because HR legitimately needs that.

| Surface | Change | Owner | Admin | HR | Manager | Executive | Field | Moderator | User |
|---|---|---|---|---|---|---|---|---|---|
| menu group `Payroll` | tighten | T | T | T (keep) | F (was T) | T (keep — exec sees aggregate) | F (was T) | F (was T) | F (was T) |
| menu group `Receipts` | hide everywhere except owner/admin | T | T | F | F | F | F | F | F |
| menu group `Deposits` | hide everywhere except owner/admin | T | T | F | F | F | F | F | F |
| menu group `Monitoring & Tools` | (already correct except moderator) | T | T | F | F | F | F | F (was T) | F |
| menu group `AI Features` | (already correct) | T | T | F | F | F | F | T → F | F |
| page `/attendance/payroll` | hr/exec/owner/admin only | T | T | T | F | T | F | F | F |
| page `/attendance/payroll-ytd` | same | T | T | T | F | T | F | F | F |
| page `/bot-logs` | owner/admin only | T | T | F | F | F | F | F | F |
| page `/test-bot` | owner/admin only | T | T | F | F | F | F | F | F |
| page `/cron-jobs` | owner/admin only | T | T | F | F | F | F | F | F |
| page `/broadcast` | owner/admin/hr | T | T | T | F | F | F | F | F |
| page `/direct-messages` | owner/admin/hr | T | T | T | F | F | F | F | F |
| page `/memory`, `/memory-analytics`, `/personality`, `/analytics` | owner/admin only | T | T | F | F | F | F | F | F |
| page `/settings` | owner/admin only (sub-pages already gated) | T | T | F | F | F | F | F | F |
| page `/health-monitoring`, `/feature-flags`, `/config-validator`, `/pre-deploy-checklist` | owner/admin only | T | T | F | F | F | F | F | F |

The migration is a sequence of `UPDATE ... WHERE role = 'X' AND (page_path = '...' OR menu_group = '...')`. All-or-nothing in one transaction. Easy to revert by re-running the inverse.

### 2B. Edge Function authorization guards (additive, per-function)

Add a small role-guard helper in `supabase/functions/_shared/` (e.g. `authz.ts`) that:
- Reads `Authorization: Bearer <jwt>` header.
- Calls `supabase.auth.getClaims(jwt)` to get `sub`.
- Looks up the user's role in `user_roles` and resolves it through `role_access_levels` (matching the existing `has_admin_access` / `has_management_access` / `has_hr_access` SQL helpers, but in TS, against the same DB rows).
- Exposes `requireRole(req, ['admin','owner', ...])` returning `{userId, role}` or throwing a 401/403.
- Logs `function_name + actor_user_id + decision` — no secrets, no PII beyond user id.

Then add a one-line `await requireRole(req, [...])` at the top of each function listed below. **No business logic is changed.** Functions that legitimately run from cron keep their existing `CRON_SECRET` check; the new guard is added only for HTTP-invoked paths.

Risk classification + required guard:

| Function | Current auth | Risk | Required guard |
|---|---|---|---|
| `admin-create-user` | manual JWT + role check | OK | none — already guarded |
| `admin-checkout` | manual JWT + `has_role admin` | OK | none |
| `admin-response-points-rollback` | service role only | **P0** | `['admin','owner']` |
| `payslip-generator` | service role only | **P0** | `['admin','owner','hr']` |
| `payroll-notification` | service role only (also runs from cron) | **P0** | cron OR `['admin','owner','hr']` |
| `report-generator` | service role only | **P1** | `['admin','owner','hr','manager','executive']` |
| `backfill-primary-groups` | service role only | **P0** | `['admin','owner']` |
| `backfill-work-sessions` | service role only | **P0** | `['admin','owner']` |
| `backfill-work-sessions-time-based` | service role only | **P0** | `['admin','owner']` |
| `branch-report-backfill` | service role only | **P1** | `['admin','owner','hr']` |
| `fix-user-names` | service role only | **P1** | `['admin','owner']` |
| `instant-ot-grant` | needs verification | **P0** | `['admin','owner','manager','hr']` |
| `overtime-approval` | needs verification | **P1** | `['admin','owner','manager','hr']` |
| `early-leave-approval` | needs verification | **P1** | `['admin','owner','manager','hr']` |
| `flexible-day-off-approval` | needs verification | **P1** | `['admin','owner','manager','hr']` |
| `remote-checkout-approval` | service role only | **P1** | `['admin','owner','manager','hr']` |
| `point-redemption` | service role only | **P1** | authenticated employee for "request"; admin/hr/owner for "approve" — keep existing action discriminator |
| `ai-query-test` | needs verification | **P1** | `['admin','owner']` |
| `streak-backfill`, `response-analytics-backfill`, `memory-backfill` | service role | **P1** | `['admin','owner']` |
| `dm-send`, `broadcast-send` | needs verification | **P1** | `['admin','owner','hr']` |
| `import-line-chat` | (per audit) | **P1** | `['admin','owner']` |
| `google-oauth` | needs verification | **P2** | flow-specific; verify before changing |
| `attendance-submit`, `attendance-validate-token`, `employee-menu-validate`, `employee-liff-validate`, `line-webhook`, `verify-line-webhook` | public (signed/tokenised) | OK | **do not touch** |

Each function gets at most **3 lines** of new code (import + guard call + try/catch). No business logic, no return-shape change for happy path.

### 2C. Dead navigation cleanup (DB-only, no UI changes)

`Receipts` and `Deposits` menu groups in `webapp_menu_config` are set to `can_access=false` for all roles except `owner` and `admin` (kept just so an admin can see the rows exist). They were already invisible because there are no nav items, but this hardens against future menu builders that read this table.

Documentation note added to `docs/STATUS.md` describing that the receipt/deposit feature was removed (Phase 2-4 per `.lovable/CRITICAL_FILES.md`) and the `document_uploads` table is the only surviving artifact.

### 2D. Canonical status doc

Create `docs/STATUS.md` (new file, no overwrite of any existing doc). Single source of truth covering: positioning, working/partial/missing modules, protected areas, route/menu summary, edge-function auth summary, and recommended next phases. Old phase docs are kept as-is.

### 2E. Smoke test

Run the existing `scripts/smoke-test.mjs` after migration + function edits. No changes to the smoke script itself. Build errors will be fixed only if directly caused by the additive guard import.

---

## 3. What Will NOT Be Changed

- `supabase/functions/line-webhook/index.ts` — untouched
- `supabase/functions/attendance-submit`, `attendance-validate-token`, `employee-menu-validate`, `employee-liff-validate`, `verify-line-webhook` — untouched (public/signed endpoints)
- `claim_attendance_token` RPC, all RLS helper functions, all triggers
- `point_transactions` ledger semantics
- Bangkok TZ helpers
- Portal check-in/out flow, LIFF flow
- Existing routes in `App.tsx` (no add, no remove)
- `useAdminRole`, `useUserRole`, `usePageAccess`, `ProtectedRoute` — logic unchanged (the existing menu-group + page-config gate already works, we are only correcting the **data** it reads)
- Both attendance triggers (redundant but not harmful — documented only)
- Auto-generated files (`src/integrations/supabase/*`, `.env`, `supabase/config.toml` project-level)

---

## 4. Receipts / Deposits Verdict

**Verdict: B) Hide for now.** Evidence:
- DB: only `document_uploads` exists; no `receipt_*` / `deposit_*` tables
- Routes: zero `/receipts` or `/deposits` paths in `App.tsx`
- Nav: not in `DashboardLayout.tsx`
- Menu config: `Receipts` and `Deposits` rows exist in `webapp_menu_config` for almost every role — pure residue
- `.lovable/CRITICAL_FILES.md` invariant #4 explicitly says "Receipt/Deposit removed (Phase 2-4) — ห้ามเพิ่มกลับโดยไม่ถาม user"

Action: set `can_access=false` for those menu groups for all roles except owner/admin. Do **not** delete the rows, do **not** drop tables, do **not** touch the bot deprecation messages for `/receipt` and `/deposit` commands. Decision on Build/Archive deferred to Phase 1 backlog.

---

## 5. Audit Log Tables — Findings Only (no changes in 0A)

Six tables exist with overlapping but distinct purposes. They will be documented in `docs/STATUS.md` as-is. No merge, no rewrite.

| Table | Tracks | Written by |
|---|---|---|
| `audit_logs` | generic CRUD audit (employee changes via `audit_employee_changes` trigger, manual entries via `log_audit_trail`) | trigger + RPC + edge fns |
| `audit_logs_detailed` | richer per-field deltas | needs verification (likely newer schema) |
| `ai_query_audit_logs` | AI cross-group query usage | `line-webhook` cross-group path |
| `approval_logs` | OT/leave/early-leave/remote-checkout approvals | approval edge fns |
| `system_health_logs` | cron + health checks | `health-check`, cron jobs |
| `webhook_verification_logs` | LINE webhook signature verification events | `verify-line-webhook` |

Gap noted (for Phase 0B/1 only): payroll generation/export and points-rollback do not currently write to `audit_logs`. Recommendation deferred — adding writes here is additive but should be its own change.

---

## 6. Attendance Trigger Verification

Both triggers are attached to `attendance_logs` BEFORE INSERT:
- `prevent_duplicate_attendance` → `enhanced_prevent_rapid_attendance()`
- `trg_prevent_rapid_attendance` → `prevent_rapid_attendance()`

Both use the same 30-second window and same uniqueness check (`employee_id` + `event_type`). Whichever fires first raises `23505`. **No conflict, no double-blocking** — the second never executes when the first raises. They are redundant but safe. **Action in 0A: documentation note only.** A future cleanup can drop one (likely the older `trg_prevent_rapid_attendance`) but that is out of scope here.

---

## 7. Detailed Plan / File-Level Changes

```text
NEW FILES
  supabase/migrations/<ts>_phase_0a_lockdown.sql        (additive UPDATE statements only)
  supabase/functions/_shared/authz.ts                   (small JWT+role helper)
  docs/STATUS.md                                        (canonical status doc)

EDITED FILES (each gets ~3 lines: import + guard call + error wrap)
  supabase/functions/admin-response-points-rollback/index.ts
  supabase/functions/payslip-generator/index.ts
  supabase/functions/payroll-notification/index.ts        (preserve cron path)
  supabase/functions/report-generator/index.ts
  supabase/functions/backfill-primary-groups/index.ts
  supabase/functions/backfill-work-sessions/index.ts
  supabase/functions/backfill-work-sessions-time-based/index.ts
  supabase/functions/branch-report-backfill/index.ts
  supabase/functions/fix-user-names/index.ts
  supabase/functions/instant-ot-grant/index.ts
  supabase/functions/overtime-approval/index.ts
  supabase/functions/early-leave-approval/index.ts
  supabase/functions/flexible-day-off-approval/index.ts
  supabase/functions/remote-checkout-approval/index.ts
  supabase/functions/point-redemption/index.ts            (action-discriminated)
  supabase/functions/ai-query-test/index.ts
  supabase/functions/streak-backfill/index.ts
  supabase/functions/response-analytics-backfill/index.ts
  supabase/functions/memory-backfill/index.ts
  supabase/functions/dm-send/index.ts
  supabase/functions/broadcast-send/index.ts
  supabase/functions/import-line-chat/index.ts

UNTOUCHED (explicit allowlist of "do not modify")
  supabase/functions/line-webhook/**
  supabase/functions/attendance-submit/**
  supabase/functions/attendance-validate-token/**
  supabase/functions/employee-menu-validate/**
  supabase/functions/employee-liff-validate/**
  supabase/functions/verify-line-webhook/**
  src/integrations/supabase/**
  src/App.tsx
  src/hooks/useUserRole.ts, usePageAccess.ts, useAdminRole.ts
  src/components/ProtectedRoute.tsx
  All RLS helper SQL functions
  All attendance triggers
```

---

## 8. Regression Checklist (run after each step)

1. Login as admin → verify all admin pages still load.
2. Login as `manager` test user → verify Payroll, Bot Logs, Memory, Personality, Test Bot are now hidden / 403.
3. Login as `employee` → verify portal still works, no admin pages reachable (already gated).
4. Run `node scripts/smoke-test.mjs`.
5. Trigger one attendance check-in via existing token flow → must succeed.
6. Trigger one OT approval via portal manager → must succeed (the guard list includes `manager`).
7. Confirm cron-invoked functions (`payroll-notification` etc.) still succeed by checking edge logs after their next scheduled run.
8. Verify build passes (Lovable runs build automatically).

---

## 9. Recommended Phase 0B Tasks (not part of 0A)

- Drop the redundant `trg_prevent_rapid_attendance` trigger (after a quiet observation week).
- Add a unit-test-style script that diffs `App.tsx` routes against `webapp_page_config` and fails CI on drift.
- Consolidate `audit_logs` vs `audit_logs_detailed` (decide one canonical, migrate writes).
- Add audit-log writes for payslip generation and points rollback.
- Decide formal fate of `document_uploads` (keep, repurpose for HR documents in Phase 1, or archive).
- Refactor of `line-webhook/index.ts` is **explicitly deferred** until a separate hardening phase with test coverage in place.

## 10. Recommended Phase 1 Tasks (HR MVP)

- Employee Documents module (contracts, ID copies, expiry reminders) — leverage existing `document_uploads` + storage.
- Payroll period locking + bank export (SCB/KBank file format).
- Move `leave_types` from string columns to a managed table.
- Consolidate the 38 attendance admin pages into a smaller IA.
- Onboarding/offboarding workflow.

---

## 11. Approval Required to Proceed

After approval, the implementation order will be:
1. Create `docs/STATUS.md` (no risk).
2. Create `supabase/functions/_shared/authz.ts` (no risk — new file).
3. Add guards to the 21 listed edge functions (one PR-sized batch).
4. Create the permission-lockdown migration.
5. Run smoke test + regression checklist.
6. Report back with diffs and test results.

No step removes existing functionality. Any failure is reverted by undoing the migration UPDATE or removing the 3-line guard.
