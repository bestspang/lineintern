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
