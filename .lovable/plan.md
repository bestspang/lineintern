## Phase 0B Completion Plan

Finish the four remaining Phase 0B tasks. Strictly additive. No payroll math, no payslip math, no LINE webhook, no attendance core, no Bangkok timezone helpers, no point ledger semantics.

### Task 1 — Audit backfill on 6 guarded functions

Add a single best-effort `writeAuditLog(...)` call right before the success-path `return new Response(...)` in each function. Capture `userId`/`role` returned by the existing `requireRole(...)` (store into local `caller` vars). Audit failure must NOT break the response (already guaranteed by `_shared/audit.ts`).

| Function | actionType | resourceType | Key metadata |
|---|---|---|---|
| `payslip-generator` | `generate` | `payslip` | `period_id`, `employee_id`, `record_id`, `source: 'admin_ui'` (no salary numbers) |
| `payroll-notification` | `send` | `payroll_notification` | `period_id`, `total`, `sent`, `failed`, `skipped`, `source: 'admin_ui'` (no per-employee amounts) |
| `backfill-work-sessions` | `backfill` | `work_sessions` | `employees_processed`, `sessions_created`, `sessions_skipped`, `errors`, `source: 'backfill'` |
| `backfill-work-sessions-time-based` | `backfill` | `work_sessions` | `date_range`, `employees_processed`, `sessions_created`, `sessions_skipped`, `errors`, `source: 'backfill'` |
| `branch-report-backfill` | `backfill` | `branch_report` | `group_id`, `parsed`, `saved`, `skipped`, `failed`, `dry_run`, `source: 'backfill'` |
| `report-generator` (manual path only) | `generate` | `group_report` | `count`, `mode: manual`. Wrapped in `if (type !== 'auto_summary')` so the cron/internal path is never audited. |

Pattern, applied identically:

```ts
let callerUserId: string | null = null;
let callerRole: string | null = null;
try {
  const r = await requireRole(req, [...], { functionName: '...' });
  callerUserId = r.userId; callerRole = r.role;
} catch (e) { ... }
// ... existing logic unchanged ...
await writeAuditLog(supabase, {
  functionName: '...',
  actionType: '...',
  resourceType: '...',
  resourceId: <uuid or null>,
  performedByUserId: callerUserId,
  callerRole,
  metadata: { ... },
});
return new Response(...);
```

Excluded from audit (intentional): `report-generator` `auto_summary` (cron/internal), error returns, validation 400s, "no records" fast-paths.

### Task 2 — Role-priority safety in `remote-checkout-approval`

Enforce that the approver's role priority must be ≥ the target employee's role priority, with admin/owner always allowed. Keep both call paths (user JWT + internal `portal-data`) working.

Implementation:

1. After resolving `request` and target `employee`, fetch the target's role priority:
   ```sql
   SELECT er.priority, er.role_key
     FROM employees e
     LEFT JOIN employee_roles er ON er.id = e.role_id
    WHERE e.id = <target>;
   ```
2. Resolve the approver's priority:
   - **User-bearer path**: priority comes from `callerRoleLabel` (already known) using the same number ladder used by `get_user_role_priority` (owner=10, hr=9, admin=8, executive=5, manager=5, field=1, others=0). Use a small local `roleToPriority()` helper instead of inventing a new system.
   - **Internal path** (`portal-data`): fall back to looking up `approver_employee_id`'s `employee_roles.priority` via the service-role client (the human approver is captured in `approver_employee_id`).
3. Decision rule:
   - admin/owner → always allow.
   - else → allow only if `approver_priority >= target_priority`.
   - On block → return `403 { code: 'forbidden_role_priority', error: 'ไม่สามารถอนุมัติคำขอของผู้ที่มีระดับสิทธิ์สูงกว่า' }`.
4. Audit row already exists; add new metadata keys: `target_employee_id`, `target_role`, `target_priority`, `approver_employee_id`, `approver_priority`, `approver_role`, `priority_check_result: 'pass'|'bypass_admin'`. On block, write a `denied` audit row before returning 403.

Do NOT invent any new RPC. Use raw select on existing tables.

### Task 3 — Points RLS review and one minimal fix

Audit result (from `pg_policies`):

| Table | Verdict |
|---|---|
| `happy_points` | ✅ employees see own; admins manage. Keep. |
| `point_transactions` | ✅ employees see own; only admins/service-role insert. No employee mutate path. Keep. |
| `point_rewards` | ✅ active rewards public; admins manage. Keep. |
| `point_redemptions` | ✅ employees see/insert own (WITH CHECK ties `employee_id` to caller); admins manage. Edge function is canonical, but direct INSERT is bound to caller — no escalation. Keep. |
| `gacha_box_items` | ✅ catalog readable; service-role manages. Keep. |
| `employee_bag_items` | ⚠️ **Missing employee SELECT policy.** `RewardShop.tsx` reads it directly and silently returns 0 on RLS error → bag count is broken for all non-admin employees. |

**Fix (one migration, additive)**:

```sql
CREATE POLICY "Employees can view own bag items"
ON public.employee_bag_items
FOR SELECT
TO authenticated
USING (
  employee_id IN (
    SELECT e.id FROM public.employees e
    WHERE e.auth_user_id = auth.uid()
       OR e.line_user_id = (auth.jwt() ->> 'sub')
  )
);
```

No INSERT/UPDATE/DELETE policy added — mutations stay admin/HR/service-role only (preserves point ledger integrity). MyPoints/RewardShop/Gacha/admin approval flows untouched.

### Task 4 — Notifications RLS review

Audit result: ✅ no changes needed.

- `Employees can read own notifications` — covers both `auth.jwt()->>'sub' = line_user_id` and `auth.users.id = e.line_user_id::uuid` mappings.
- `Admins can read all notifications` — admin/owner via `has_admin_access`.
- `Admins can insert notifications` — direct insert restricted to admins; **service role bypasses RLS** so existing edge-function writers (remote-checkout-approval, point-redemption, etc.) keep working.
- `Employees can update own notifications` — covers mark-as-read.
- No DELETE policy → employees cannot delete; intentional.

Manager/scope SELECT for notifications is not currently a feature in the portal; nothing to widen. Document as reviewed, no change.

### Task 5 — Docs

- Append a **Phase 0B** section to `docs/STATUS.md` summarizing the audit backfill, role-priority enforcement, RLS additions, and updating the "Partial → audit logging" line so the 6 functions are no longer pending.
- Create `docs/PHASE_0B_SECURITY_REPORT.md` with: completed items, RLS pg_policies snapshot, role-priority decision matrix, manual test checklist, residual risks, Phase 1 readiness verdict.

### Task 6 — Verification

- `npm run build` (must pass).
- `npm run smoke:quick` (and `npm run smoke` if defined and safe — will check `package.json`).
- Manual checklist in the report: own-redemption ✅, cross-employee redemption 403, gacha own ✅, manager approve redemption ✅, user/field cannot approve, manager remote checkout approval ✅, manager blocked from approving higher-priority target → 403, liff-settings admin ✅ / non-admin 403, payroll notification ✅, branch report import ✅, MyPoints / RewardShop bag count visible after RLS fix.

### Files touched

Edge functions (audit add only, no logic change):
- `supabase/functions/payslip-generator/index.ts`
- `supabase/functions/payroll-notification/index.ts`
- `supabase/functions/backfill-work-sessions/index.ts`
- `supabase/functions/backfill-work-sessions-time-based/index.ts`
- `supabase/functions/branch-report-backfill/index.ts`
- `supabase/functions/report-generator/index.ts` (manual path only)

Edge function (additive role-priority + audit metadata):
- `supabase/functions/remote-checkout-approval/index.ts`

Migration (additive RLS):
- one new SQL migration adding the `Employees can view own bag items` policy.

Docs:
- `docs/STATUS.md`
- `docs/PHASE_0B_SECURITY_REPORT.md` (new)

### Hard non-goals (will NOT touch)

- `supabase/functions/line-webhook/**`
- `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`
- Bangkok timezone helpers
- Payroll calc math, payslip HTML/number math, point ledger math
- Existing portal check-in/check-out flow
- Any "// ⚠️ VERIFIED" function

### Regression checklist

- All 6 audit additions are inside try/catch already; audit insert failure is best-effort.
- `remote-checkout-approval` internal portal-data path returns same shape; only adds 403 when priority blocks.
- New RLS policy is SELECT-only; cannot widen mutation surface.
- No type changes to `src/integrations/supabase/types.ts`.
- No frontend changes.