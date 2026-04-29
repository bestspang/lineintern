# Project Status — LINE Intern

_Last updated: 2026-04-29 (Phase 0A finalized)_

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
- Audit logging: now structured for 7 guarded functions; not yet covered for the rest.
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

## Known risks

### P1 — `point-redemption` trusts `employee_id` from request body

**Problem.** `supabase/functions/point-redemption/index.ts` accepts
`employee_id` from the JSON body and uses the service-role client to deduct
points, mark items used, and pull gacha — with **no JWT validation**, no
caller↔employee linkage, and no audit row.

**Risk.** Any party with the public anon key (i.e. anyone who can load the
SPA) can:
- Redeem rewards on behalf of any employee, draining their balance.
- Trigger gacha pulls on someone else's account.
- Mark another employee's bag items as used.
- Approve / reject redemptions if they guess the action name.

**Current behavior.** Function entry has zero auth; only `action` switch.

**Recommended Phase 0B fix (minimal, do NOT do in 0A):**
1. Call `requireRole(req, [<all roles>], { strict: false })` to capture caller user id.
2. Resolve caller's `employees.id` via `auth_user_id`.
3. For `redeem`, `redeem_to_bag`, `use_bag_item`, `gacha_pull`:
   enforce `body.employee_id === caller.employee_id`.
4. For `approve`, `reject`, `use`: require `admin|owner|hr|manager`
   (use existing `has_management_access`).
5. Write a `writeAuditLog` row per action: `action`, `reward_id`,
   `points`, `balance_after`, `caller_role`.

### Other risks

- **Receipts / Deposits admin menus** still visible to non-admins because
  removing them would also affect portal references. Deferred until the
  receipts/deposits admin flows are either implemented or formally deprecated.
- **Payroll calculation logic** (Payroll.tsx, payslip-generator math) was
  not touched in Phase 0A. Still works as before — but no test coverage.
- **LINE webhook core** (`line-webhook/index.ts`) was not modified.
- **`audit_logs`** has no retention policy yet.
- **Frontend raw-fetch + publishable-key callers** other than the one we
  fixed should be inventoried in Phase 0B.

---

## Protected — DO NOT modify without explicit approval

- `supabase/functions/line-webhook/**` (the entire 11K-line monolith).
- `supabase/functions/_shared/timezone.ts` and any `formatBangkokISODate`
  / `getBangkokDateString` helpers.
- `public.claim_attendance_token` SQL function.
- `supabase/functions/attendance-submit/**` and `attendance-validate-token/**`.
- Payroll calculation math in `Payroll.tsx`, `payslip-generator/index.ts`,
  `payroll-notification/index.ts`.
- Any function or component carrying a `// ⚠️ VERIFIED` comment.

---

## Phase 0B candidates (queue, not yet started)

1. Harden `point-redemption` (the P1 above).
2. Inventory and fix any remaining raw-fetch + publishable-key edge-function
   callers in the frontend.
3. Add audit-log retention (e.g. drop rows older than 180 days nightly).
4. Add `writeAuditLog` to `payslip-generator`, `payroll-notification`,
   `admin-response-points-rollback`, `fix-user-names`.
5. Enforce role priority on `remote-checkout-approval` body so a manager
   cannot approve the checkout of someone with a higher priority role.
6. Real RLS pass on `point_transactions`, `employee_bag_items`,
   `point_redemptions`.
7. Tighten `notifications` RLS: confirm employees only see their own.
8. Replace any UI that still uses `VITE_SUPABASE_PUBLISHABLE_KEY` as a
   bearer with `supabase.functions.invoke()`.

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
