
# Phase 0A Verification & Finishing Plan

Scope is strictly: verify, fix the smallest regression introduced by Phase 0A, lock down over-permissive menus/pages, document the `point-redemption` P1, finish docs, and run build + smoke. No new HR features. No webhook/attendance/timezone refactors.

---

## 1. Findings (read-only audit complete)

### 1A. Import paths — all correct
All 17 functions import `../_shared/authz.ts` (and `../_shared/audit.ts` where audit was added) with the correct relative path. No duplicate imports, no broken `Record` usage, no malformed spread, no unused imports detected.

### 1B. `_shared/authz.ts` — verified
- Compiles under Deno edge runtime (uses `https://esm.sh/@supabase/supabase-js@2`).
- Tries `auth.getClaims` first (signing-keys), falls back to `auth.getUser` — works with current SDK.
- `AuthzError` carries `status` + `code`; `authzErrorResponse` returns proper JSON with cors headers.
- Logs only `actor=<uuid>` and `role=<role>` — no PII, no secrets.
- Handles all four failure modes (no bearer, empty bearer, invalid JWT, no role, wrong role).

### 1C. `_shared/audit.ts` — verified
- Best-effort, never throws. UUID-validates ids before insert. Clips strings to 200 chars. Masks LINE user ids.

### 1D. Guarded function caller matrix

| Function | Caller(s) | Caller sends user JWT? | Guard correct? | Risk |
|---|---|---|---|---|
| admin-response-points-rollback | `PointRules.tsx` via `invoke` | yes | admin/owner ✓ | none |
| payslip-generator | `Payroll.tsx` via `invoke` | yes | admin/owner/hr ✓ | none |
| payroll-notification | `Payroll.tsx` via `invoke` | yes | admin/owner/hr ✓ | none |
| report-generator | `Summaries.tsx` via `invoke` (user) **AND** `line-webhook` (no JWT, type=`auto_summary`) | mixed | guard skipped when `type==='auto_summary'` ✓ | none |
| backfill-primary-groups | `Users.tsx` via `invoke` | yes | admin/owner ✓ | none |
| backfill-work-sessions | no UI caller found (operator-only) | n/a | admin/owner ✓ | none |
| backfill-work-sessions-time-based | no UI caller found | n/a | admin/owner ✓ | none |
| branch-report-backfill | no UI caller found | n/a | admin/owner ✓ | none |
| fix-user-names | `Users.tsx`, `ProfileSyncHealth.tsx` via `invoke` | yes | admin/owner ✓ | none |
| remote-checkout-approval | `portal-data` (internal, x-internal-source + service-role) | n/a | strict internal-marker check + management roles ✓ | none |
| streak-backfill | no UI caller found | n/a | admin/owner ✓ | none |
| response-analytics-backfill | `HistoricalAnalysis.tsx` via `invoke` | yes | admin/owner ✓ | none |
| memory-backfill | `Memory.tsx` via `invoke` | yes | admin/owner ✓ | none |
| dm-send | `ChatPanel.tsx` via `invoke` | yes | admin/owner/hr/manager/moderator ✓ | none |
| broadcast-send | `Broadcast.tsx` via `invoke` | yes | admin/owner/hr ✓ | none |
| **import-line-chat** | `BranchReportImport.tsx` via **raw fetch with `VITE_SUPABASE_PUBLISHABLE_KEY`** (NOT user JWT) | **NO** | guard requires user JWT → **WILL 401** | **regression** |
| portal-data | unchanged auth path; only adds `x-internal-source` header on its own outbound call to remote-checkout-approval | — | unchanged | none |

### 1E. The one regression to fix
`src/pages/branch-reports/components/BranchReportImport.tsx` calls `import-line-chat` with the publishable/anon key as the bearer. After Phase 0A this returns 401 from `requireRole`. Minimal fix: switch the caller to `supabase.functions.invoke('import-line-chat', { body: { content } })` so the user's JWT is auto-attached. No edge-function change required.

### 1F. Permission audit (current state, Live DB)
- `webapp_page_config`: `user`, `manager`, `executive`, `hr`, `moderator` all have `can_access=true` for high-risk pages: `/bot-logs`, `/broadcast`, `/cron-jobs`, `/test-bot`, `/health-monitoring`, `/config-validator`, `/integrations`, `/safety-rules`, `/training`, `/memory`, `/memory-analytics`, `/personality`, `/analytics`, `/direct-messages`, `/attendance/payroll`, `/attendance/payroll-ytd`, `/attendance/happy-points`, `/attendance/point-transactions`, `/attendance/redemption-approvals`, `/settings`, `/settings/reports`.
- `field`: only 7 pages allowed — already field-appropriate, leave alone.
- `employee`: 0 pages — leave alone.
- `owner` and `admin`: full access — preserve.

### 1G. `point-redemption` — confirmed P1 (document only, do NOT fix in this phase)
`supabase/functions/point-redemption/index.ts` accepts `employee_id` from the request body and performs deduction with the service role with no JWT verification, no caller↔employee linkage check, and no audit row. Anyone with the public anon key can redeem on behalf of any employee.

---

## 2. Changes to make (small + reversible)

### 2.1 Fix `BranchReportImport.tsx` regression
Replace the raw `fetch(...)` with `supabase.functions.invoke('import-line-chat', { body: { content } })`. Map `error` and `data` to the existing `setResult` / toast shape. No other behavior change.

### 2.2 Permission lockdown migration (additive UPDATE only — no DELETE)
File: `supabase/migrations/<ts>_phase_0a_permission_lockdown.sql`

Pre-migration: `SELECT` snapshot of risky permissions (printed in the SQL via comment + a `RAISE NOTICE`).

For `webapp_menu_config` and `webapp_page_config`, set `can_access = false` for the role/page combinations below. Owner and admin are never touched.

Page lockdown table (set `can_access=false`):

| Page path / pattern | Roles to deny |
|---|---|
| `/bot-logs`, `/test-bot`, `/cron-jobs`, `/health-monitoring`, `/config-validator`, `/integrations`, `/safety-rules`, `/training` | hr, manager, executive, moderator, user |
| `/memory`, `/memory-analytics`, `/personality`, `/analytics` | hr, manager, executive, user (keep moderator only if currently used — set false everywhere except admin/owner) |
| `/broadcast`, `/direct-messages` | executive, manager, moderator, user (keep hr — broadcast/dm allowed for hr) |
| `/attendance/payroll`, `/attendance/payroll-ytd` | manager, executive, moderator, user (keep hr) |
| `/attendance/happy-points`, `/attendance/point-transactions`, `/attendance/redemption-approvals` | executive, moderator, user (keep hr, manager) |
| `/settings`, `/settings/reports` | hr, manager, executive, moderator, user |

Menu group lockdown for `webapp_menu_config` (mirror the page denials so empty groups don't render):
- `Monitoring & Tools`: false for hr, manager, executive, moderator, user
- `AI Features`: false for hr, manager, executive, user, moderator
- `Configuration`: false for hr, manager, executive, moderator, user (already false for most)
- `Content & Knowledge`: false for hr, manager, executive, user (keep moderator only if other pages remain; otherwise false)
- `Receipts`, `Deposits`: leave as-is (dead-menu hide is documented as TODO, not changed yet — these are referenced by portal too)

Rules respected:
- No `DELETE` rows.
- Only flips `can_access` from `true` → `false`.
- Uses explicit `WHERE role IN (...) AND page_path IN (...)` so owner/admin are never matched.
- Wrapped in a single transaction with row-count `RAISE NOTICE`.
- After-migration: `SELECT` summary printed via `RAISE NOTICE` for the new role/page matrix.

### 2.3 `docs/STATUS.md` — extend (do not delete existing content)
Append sections:
- Product positioning (LINE-first HR Ops for Thai SMEs).
- Confirmed strong / partial / missing modules (concise lists; no invention).
- Phase 0A change log including the `BranchReportImport` regression fix and the permission lockdown migration.
- Edge-function guard summary table (move from current short table; keep the existing one and mark as canonical).
- Menu/page permission status (post-lockdown summary).
- Known risks (point-redemption P1, dead Receipts/Deposits menus, payroll calc untouched, webhook untouched).
- Protected areas not to touch (line-webhook core, attendance tokens, claim_attendance_token, Bangkok timezone helpers, payroll calculation).
- Phase 0B candidates (point-redemption hardening, role priority enforcement on remote-checkout-approval body, audit-log retention, replace remaining raw fetch + publishable key callers, real RLS pass on `point_transactions`/`employee_bag_items`).
- Phase 1 candidates (HRIS gaps: org chart, document store, contracts, leave policy engine, performance review, payslip PDF templates).
- Last updated: 2026-04-29.

### 2.4 `docs/STATUS.md` — point-redemption P1 entry
A dedicated subsection containing:
- Problem: `employee_id` is taken from request body and trusted.
- Risk: any authenticated portal user (or anyone with the public anon key) can redeem points on behalf of any employee, drain balances, trigger gacha pulls, mark items as used.
- Current behavior: function uses service-role client; no JWT validation; no caller↔employee linkage; no audit row.
- Recommended Phase 0B fix (minimal):
  1. `requireRole(req, [...all roles...], { strict: false })` to capture the caller user id.
  2. Resolve caller's `employees.id` via `auth_user_id`.
  3. If `action ∈ {redeem, redeem_to_bag, use_bag_item, gacha_pull}`: enforce `body.employee_id === caller.employee_id`.
  4. If `action ∈ {approve, reject, use}`: enforce caller has `admin|owner|hr|manager` (using existing `has_management_access` SQL).
  5. Write `writeAuditLog` row per action (action, reward_id, points, balance_after).

### 2.5 Docs index
Leave `docs/PHASE_0A_VERIFICATION.md` as-is (still accurate). Do NOT delete prior docs.

---

## 3. Verification & smoke

Run in this order, report each result:

1. `npm run build` — confirm TypeScript / Vite build passes after the `BranchReportImport` change.
2. `npm run smoke:quick` — fast smoke without rebuild.
3. `npm run smoke` — full smoke if `:quick` passes and is safe.
4. Targeted Deno import sanity check via `rg` confirming no broken imports remain (we already passed this read-only).
5. Spot SQL: re-run the high-risk page query and confirm only `owner`/`admin` (and intended residual roles for payroll/dm/broadcast) remain.

I will NOT auto-deploy or run destructive SQL outside the migration.

---

## 4. Out of scope (not touched in this task)

- LINE webhook core logic (`supabase/functions/line-webhook/**`).
- `claim_attendance_token`, attendance-submit, Bangkok timezone helpers (`_shared/timezone.ts`).
- Payroll calculation logic (`Payroll.tsx`, payslip-generator math, payroll-notification body math).
- Any large-file refactor.
- Adding new HR features.
- Fixing `point-redemption` (P1 documented only — Phase 0B).
- Receipts / Deposits dead menus (documented; not flipped because portal still references them).

---

## 5. Final report I will produce after execution

1. Executive summary
2. Files changed (one frontend file + one migration + `docs/STATUS.md`)
3. Import-path verification result
4. Authz helper verification result
5. Guarded-functions matrix (the table in 1D)
6. Internal-call bypass verification (remote-checkout-approval F/G/H/I cases against deployed code, by inspection)
7. Permission lockdown migration summary (before/after counts per role)
8. Role/page/menu matrix after lockdown
9. `docs/STATUS.md` summary
10. Build + smoke results
11. Remaining risks (point-redemption P1, dead menus, etc.)
12. Verdict: **ready for Phase 0B** if 1+2+3 succeed and migration applies cleanly; **blockers** listed otherwise.
