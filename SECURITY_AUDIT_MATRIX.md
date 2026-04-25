# Security Audit Matrix

Last updated: 2026-04-26.

This matrix is the production safety backlog for LINE Intern HR. It focuses on edge functions and workflows that read or write HR, attendance, payroll, LINE, or AI data. It intentionally does not change database schema, RLS, or public API behavior.

## CI And Dependency Baseline

- GitHub Actions baseline: `.github/workflows/ci.yml` installs with `npm ci --legacy-peer-deps`, then runs `npm run test` and `npm run build`.
- Full `npm run lint` is not a PR gate yet because the repository has substantial pre-existing lint debt. Use targeted lint for touched frontend files until the lint cleanup PR lands.
- `npm audit --json` on 2026-04-26 reports 21 vulnerabilities: 8 moderate and 13 high. Do not run automatic fixes in this batch because several fixes touch routing, build tooling, and export libraries.
- Highest dependency follow-ups: `react-router-dom`, `vite`, `xlsx`, `rollup`, `axios`, `lodash`, `lodash-es`, and transitive glob/minimatch packages.

## Status Legend

- `OK`: current control appears suitable for production, still needs routine tests.
- `Verify`: control exists, but should be covered by tests or monitoring before launch.
- `Needs fix`: control is incomplete or inconsistent with HR production requirements.
- `P0`: fix before inviting real employees.
- `P1`: fix before broad rollout or payroll use.
- `P2`: fix before scale or automation expansion.

## Production-Critical Edge Functions

| Area | Function | Surface | Current control observed | Risk | Required production action |
| --- | --- | --- | --- | --- | --- |
| Portal HR data | `portal-data` | Portal user JWT, service-role reads/writes | Validates JWT, maps requester to employee, applies owner/admin/HR global scope and manager/supervisor branch scope in PR #6 | Verify P1 | Add edge tests for role/scope matrix, approval scope, and forbidden cross-branch reads before expanding endpoints. |
| Attendance submit | `attendance-submit` | Public token form/API, service-role writes attendance | Token status/expiry checks, rate limiter, input validation, liveness/photo handling | Needs fix P1 | Replace remaining exact `event_type` checks with shared helpers, add duplicate-submit/idempotency tests, and verify token cannot be reused across employee/date. |
| Attendance token lookup | `attendance-validate-token` | Public token lookup | Token ID acts as bearer secret; validates status/expiry and returns employee/branch/settings | Needs fix P1 | Add rate limit, hide nonessential employee fields, keep token TTL short, and log invalid/expired lookup attempts. |
| LIFF employee portal | `employee-liff-validate` | Public JSON body with `line_user_id` | Looks up employee by supplied LINE user ID, no LIFF ID-token verification in the function | Needs fix P0 | Require LIFF ID token or Supabase session, validate token audience/subject server-side, add rate limit, and keep event normalization in shared helper. |
| LINE webhook | `line-webhook` | LINE webhook and public health endpoint | Verifies `X-Line-Signature` for webhook body; health path bypasses signature | Verify P1 | Keep only health path public, add AI cost/rate budget, audit all HR answer paths, and require evidence-bound responses for HR/payroll queries. |
| Admin user creation | `admin-create-user` | Authenticated admin/owner user JWT | Checks Supabase user and `user_roles` for `admin` or `owner`, then uses auth admin API | Verify P1 | Align role tables with `employee_roles`, add audit log, enforce password policy, and confirm owner/admin only by business scope. |
| Admin checkout | `admin-checkout` | Authenticated web user JWT | Checks only `has_role(..., admin)` and writes checkout via service role | Needs fix P1 | Align allowed roles with HR policy, add owner/HR scope decision, add branch constraints if managers can use it, and normalize check-in/out variants. |
| Payroll notifications | `payroll-notification` | JSON action, service-role payroll read and LINE push | No requester auth or shared secret visible before sending payroll details | Needs fix P0 | Require admin/owner/HR JWT or internal shared secret, verify payroll period state, add audit log, and prevent repeated sends without idempotency key. |
| Broadcast delivery | `broadcast-send` | JSON `broadcast_id`, service-role LINE push | No requester auth or shared secret visible before sending scheduled broadcast | Needs fix P0 | Restrict to admin/owner/HR JWT or scheduler secret, validate broadcast ownership/status transition, and rate-limit caller. |
| Direct DM | `dm-send` | JSON LINE user ID/message/group ID | No requester auth visible before LINE push and message insert | Needs fix P0 | Require admin/owner/HR JWT and branch/group scope, sanitize message, rate-limit, and audit sender identity. |
| AI reports | `report-generator` | JSON body, scheduler-like report creation, Lovable AI | Uses service role and Lovable API key; no auth or cron secret visible at handler entry | Needs fix P0 | Split scheduled mode behind `CRON_SECRET`, authenticated admin report generation behind JWT, add AI budget/rate logging. |
| Approval mutation | `remote-checkout-approval` | JSON request ID and approver employee ID | Direct endpoint trusts `approver_employee_id`; `portal-data` now sets it server-side only when proxied | Needs fix P0 | Add JWT or internal-call secret on the direct function, verify approver scope server-side, and normalize checkout event queries. |
| Approval mutation | `overtime-approval` | Authenticated admin JWT | Requires authenticated user and `admin` role | Needs fix P1 | Align owner/HR/manager scope with shared role policy, add branch scope, and ensure audit log records requester employee ID. |
| Approval mutation | `flexible-day-off-approval` | Authenticated admin JWT | Requires authenticated user and `admin` role; supports bulk updates | Needs fix P1 | Add branch scope for bulk IDs, align owner/HR/manager scope, sanitize notes, and ensure every row writes audit log. |
| Approval mutation | `early-leave-approval` | Authenticated admin JWT | Requires authenticated user and `admin` role | Needs fix P1 | Align owner/HR/manager scope, add branch scope, and normalize direct checkout writes with shared attendance event helpers. |
| Employee request | `overtime-request` | JSON employee ID | Service-role request creation with rate limit; no user/session binding visible | Needs fix P1 | Bind request to LINE webhook identity or user session, reject employee_id spoofing, and audit request source. |
| Employee request | `flexible-day-off-request` | JSON employee ID/date | Service-role request creation; no user/session binding visible | Needs fix P1 | Bind requester identity, rate-limit, validate branch/employee status, and standardize request state transitions. |
| Employee request | `early-checkout-request` | JSON employee ID/date | Service-role request creation | Needs fix P1 | Bind requester identity, normalize event queries, and use shared approval state/audit policy. |
| Employee request | `remote-checkout-request` | JSON employee ID/location | Service-role request creation | Needs fix P1 | Bind requester identity, validate geolocation/device evidence, and require manager/admin approval scope in direct approval path. |
| Health monitoring | `health-check` | Public health endpoint | Service-role checks DB, LINE, LIFF, bot activity, attendance | Needs fix P1 | Keep public response minimal or require admin/monitoring secret for detailed data; use shared event variants for attendance counts. |

## Cron And Internal Jobs

Functions that reference `CRON_SECRET` and should remain scheduler-only:

`attendance-daily-summary`, `attendance-reminder`, `attendance-snapshot-update`, `auto-checkout-grace`, `auto-checkout-midnight`, `birthday-reminder`, `memory-consolidator`, `memory-decay`, `missing-employee-checker`, `overtime-warning`, `pattern-learner`, `point-health-manager`, `point-monthly-summary`, `point-streak-calculator`, `point-weekly-summary`, `refresh-member-count`, `request-timeout-checker`, `task-scheduler`, `trigger-daily-summary`, `work-check-in`, `work-reminder`, and `work-summary`.

Required action for this group: verify each handler rejects missing/incorrect `CRON_SECRET` before creating service-role clients or reading HR data, and document any deliberate user-callable mode separately.

## AI And Lovable Guardrails

- AI-backed functions: `line-webhook`, `report-generator`, `ai-query-test`, `test-bot`, `memory-summary`, `memory-writer`, `memory-backfill`, `memory-consolidator`, `cognitive-processor`, `work-check-in`, and `work-summary`.
- Production rule: every AI answer touching HR, attendance, payroll, leave, OT, or employee status must be permission-bound, evidence-bound, audited, and rate/cost limited.
- The LINE bot must refuse payroll, personal data, or cross-branch answers when the requester cannot see the underlying database rows.
- Lovable may polish UI for these workflows only after Codex-owned auth, RLS, edge function, and payroll controls are merged.

## Attendance And Role Hardening Backlog

Remaining exact attendance event comparisons found outside the PR #6 portal slice:

- Frontend admin attendance: `src/pages/attendance/Dashboard.tsx`, `EmployeeDetail.tsx`, `EmployeeHistory.tsx`, `WorkHistory.tsx`, `Photos.tsx`, `Logs.tsx`, `Analytics.tsx`, `Payroll.tsx`, `LiveTracking.tsx`, `OvertimeManagement.tsx`, and `OvertimeSummary.tsx`.
- Frontend shared components/hooks: `src/components/attendance/PayrollExportDialog.tsx`, `AttendanceLogDetail.tsx`, `LiveAttendanceStatus.tsx`, and `src/hooks/useScheduleAttendance.ts`.
- Edge functions: `attendance-submit`, `admin-checkout`, `auto-checkout-grace`, `auto-checkout-midnight`, `attendance-daily-summary`, `attendance-snapshot-update`, `attendance-reminder`, `attendance-employee-history`, `backfill-work-sessions`, `backfill-work-sessions-time-based`, `health-check`, `instant-ot-grant`, `line-webhook`, `overtime-warning`, `point-attendance-calculator`, `remote-checkout-approval`, `remote-checkout-request`, `streak-backfill`, and `pattern-learner`.

Patch order:

1. Admin dashboard/payroll/export views, because they affect daily HR operations and payroll reconciliation.
2. `attendance-submit`, `admin-checkout`, `remote-checkout-*`, and auto-checkout functions, because they write or infer authoritative attendance state.
3. Reporting, analytics, streak, points, and AI evidence paths, because they can mislead managers if legacy event rows are ignored.

Role/scope follow-up:

- Reuse the PR #6 role policy for `admin`, `owner`, `hr`, `manager`, and `supervisor` in direct edge functions, not only `portal-data`.
- Treat manager/supervisor as branch-scoped by default.
- Treat owner/admin/HR as global only after authenticated user-to-employee mapping succeeds.
- Do not let clients supply `isAdmin`, `approver_employee_id`, `branchId`, or employee IDs that widen scope without server-side verification.
