# HR Production Readiness

This file is the working contract for upgrading LINE Intern into a production HR app while using Codex and Lovable together.

## Source Of Truth

- GitHub `main` is the deployable source of truth for Lovable sync.
- Codex owns backend-critical work: migrations, RLS, service-role edge functions, auth, role scope, payroll logic, tests, CI, and PR cleanup.
- Lovable owns bounded UI iteration: page layout, copy, visual polish, and preview checks after the behavior is already specified.
- Do not rename, move, or delete the GitHub repository connected to Lovable.
- Do not manually edit generated Lovable/Supabase client files; wrap behavior in app-owned modules instead.

## Safe Change Flow

1. Create a branch or continue the PR branch for code-critical work.
2. Keep changes grouped by workflow: attendance, approvals, payroll, portal, admin, or AI.
3. Run targeted tests/lint/build before pushing.
4. Merge into `main` only after review.
5. Let Lovable sync from `main`, then use Lovable for narrow UI polish prompts.
6. If Lovable changes `main`, pull those changes before starting another Codex branch.

## Production Gate

- GitHub Actions CI passes on PRs to `main`: `npm ci --legacy-peer-deps`, `npm run test`, and `npm run build`.
- `npm run build` passes.
- `npm run test` passes.
- Targeted ESLint passes for touched frontend files.
- Edge functions that use service-role verify requester identity, employee mapping, role scope, branch scope, and cron/shared secrets where applicable.
- Attendance code uses shared event helpers for `check_in`/`check-in` and `check_out`/`check-out`.
- Date boundaries use Bangkok timezone helpers, not raw browser-local dates.
- Owner/admin/HR/manager/supervisor role behavior is consistent between frontend portal access and `portal-data`.
- Payroll changes include reconciliation scenarios for billable minutes, late rules, leave, OT, and adjustments.
- Production/security work tracks risks in `SECURITY_AUDIT_MATRIX.md`; do not treat untriaged service-role functions as production-ready.

## Implementation Batches

1. PR cleanup: finish PR #6 and keep attendance event handling consistent.
2. Production audit: auth, roles, service-role functions, cron, secrets, LINE webhook, LIFF, custom domain.
3. Attendance hardening: normalized event types, Bangkok boundaries, duplicate sessions, auto checkout, work sessions, billable minutes.
4. Approvals: leave, OT, early leave, remote checkout state, manager/admin inbox, notifications, audit logs.
5. Payroll/reporting: payroll periods, YTD, exports, payslips, billable backfill, reconciliation.
6. Admin/owner operations: today risk, missing checkout, pending approvals, payroll cost, branch summary, bot health.
7. Lovable UI polish: one workflow at a time, no schema/security edits.
8. AI HR assistant: permission-bound answers, evidence, audit logs, rate/cost limits, and refusal when data is out of scope.

## Lovable Prompt Guardrails

Use prompts that state the boundary clearly:

> Polish the portal approvals page UI only. Do not change Supabase migrations, edge functions, auth, generated clients, payroll formulas, or role permissions.

For backend-sensitive work, make Lovable produce a plan or UI mock only, then let Codex implement the code through a PR.
