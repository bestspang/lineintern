# Phase 0B Security Report

_Date: 2026-04-29 (Asia/Bangkok)_
_Author: Lovable agent, additive-only changes._

This report closes Phase 0B. Phase 0A.1, Phase 0A.2 (point-redemption JWT
+ ownership, liff-settings hardening, audit_logs 180-day retention,
raw-fetch scan, partial audit backfill) are already documented in
`docs/STATUS.md`. Phase 0B finishes the remaining items: full audit
coverage on the 6 deferred guarded functions, role-priority enforcement
on `remote-checkout-approval`, an RLS pass on points & notifications,
and an RLS fix for the portal Reward Shop bag count.

---

## 1. Executive summary

| Item | Status |
|------|--------|
| Audit backfill on 6 guarded functions | ✅ Done |
| `remote-checkout-approval` role-priority enforcement | ✅ Done (covers user-JWT and internal portal-data paths) |
| Points RLS review | ✅ Reviewed; one missing employee SELECT policy added on `employee_bag_items`. No other changes. |
| Notifications RLS review | ✅ Reviewed; no changes needed. |
| Docs updated | ✅ STATUS.md + this file |
| Build + smoke | ✅ See §7 |

No payroll math, no payslip math, no point-ledger math, no LINE webhook,
no attendance core, no Bangkok timezone helper was modified.

---

## 2. Files changed

Edge functions (audit-only addition; no business logic changes):

- `supabase/functions/payslip-generator/index.ts`
- `supabase/functions/payroll-notification/index.ts`
- `supabase/functions/backfill-work-sessions/index.ts`
- `supabase/functions/backfill-work-sessions-time-based/index.ts`
- `supabase/functions/branch-report-backfill/index.ts`
- `supabase/functions/report-generator/index.ts` _(manual path only — `auto_summary` cron/internal path is intentionally NOT audited)_

Edge function (additive role-priority + extended audit metadata):

- `supabase/functions/remote-checkout-approval/index.ts`

Database migration (additive RLS):

- `supabase/migrations/<timestamp>_employee_bag_items_select.sql`
  – adds `Employees can view own bag items` SELECT policy.

Docs:

- `docs/STATUS.md` (Phase 0B section appended)
- `docs/PHASE_0B_SECURITY_REPORT.md` (this file, new)

---

## 3. Audit backfill — completed

For every function below, `requireRole(...)` now also captures
`{ userId, role }` into local `callerUserId` / `callerRole` vars, and a
single best-effort `writeAuditLog(...)` call is placed immediately
before the success-path `return new Response(...)`. Audit failure can
never break the response (`_shared/audit.ts` swallows insert errors).

| Function | actionType | resourceType | metadata captured |
|---|---|---|---|
| `payslip-generator` | `generate` | `payslip` | `period_id`, `employee_id`, `record_id`, `source: 'admin_ui'` — no salary numbers |
| `payroll-notification` | `send` | `payroll_notification` | `period_id`, `total`, `sent`, `failed`, `skipped`, `targeted_employee_count`, `source: 'admin_ui'` — no per-employee amounts |
| `backfill-work-sessions` | `backfill` | `work_sessions` | `employees_processed`, `sessions_created`, `sessions_skipped`, `errors`, `source: 'backfill'` |
| `backfill-work-sessions-time-based` | `backfill` | `work_sessions` | `date_range`, `employees_processed`, `sessions_created`, `sessions_skipped`, `errors`, `source: 'backfill'` |
| `branch-report-backfill` | `backfill` | `branch_report` | `group_id`, `total`, `parsed`, `saved`, `skipped`, `errors`, `dry_run`, `source: 'backfill'` — no raw message text |
| `report-generator` (manual only) | `generate` | `group_report` | `count`, `mode: 'manual'`, `requested_group_id`, `source: 'admin_ui'` — wrapped in `if (type !== 'auto_summary')` |

### What is intentionally NOT audited

- `report-generator` `auto_summary` (called internally by `line-webhook`).
- Validation-failure 400 responses on the same functions.
- "no records" early-exit fast paths on backfill jobs.
- Error 500 responses (already logged via `console.error`).

### PII / secret guard

No function logs: secrets, raw payloads, full LINE user ids, photo URLs,
or per-employee payroll numbers. For `branch-report-backfill` we skip
the raw message text. For `payroll-notification` we keep counts only.
For `payslip-generator` we keep period + employee id but no money.

---

## 4. `remote-checkout-approval` — role priority

### Decision matrix

```
admin / owner         → always allowed (bypass_admin)
hr (priority 9)       → may approve targets with priority ≤ 9
manager (priority 5)  → may approve targets with priority ≤ 5
                        → BLOCKED for owner(10), hr(9), admin(8)
executive (priority 5)→ same as manager
field / user          → not on the allow-list at all (rejected by requireRole)
internal portal-data  → priority resolved from approver_employee_id
                        (not from JWT, since the call uses service role)
```

The numeric ladder used (`roleToPriority()` in
`remote-checkout-approval/index.ts`) mirrors `public.get_user_role_priority`
and the `employee_roles.priority` column. No new RPC was invented.

### Code shape

1. After the existing internal-marker / `requireRole` block, the function
   resolves the **target's** priority from
   `employees.role_id → employee_roles.priority`.
2. The **approver's** priority is resolved from `callerRoleLabel` on the
   user-JWT path, or from `approver_employee_id → employee_roles.priority`
   on the internal portal-data path.
3. admin/owner bypass; otherwise `approver_priority >= target_priority`
   is required.
4. On block:
   - One `denied` audit row is written (best-effort).
   - Returns `403 { code: 'forbidden_role_priority', error: '...' }`.
5. On pass: existing approve/reject flow is unchanged. Existing audit
   row was extended with `target_employee_id`, `target_role`,
   `target_priority`, `approver_employee_id`, `approver_role`,
   `approver_priority`, `priority_check_result`.

### Internal portal-data path

Still works unchanged — it sets `x-internal-source: portal-data` plus
service-role bearer, then provides `approver_employee_id` in the JSON
body. The priority check now also runs on this path, using the human
approver's `employee_roles.priority`.

---

## 5. Points RLS — reviewed

`pg_policies` snapshot (run `SELECT tablename, policyname, cmd FROM
pg_policies WHERE schemaname='public' AND tablename IN
('happy_points','point_transactions','point_rewards',
'point_redemptions','employee_bag_items','gacha_box_items')` for the
live view):

| Table | Verdict | Notes |
|---|---|---|
| `happy_points` | ✅ no change | Employees see own balance via line_user_id mapping; admins manage. |
| `point_transactions` | ✅ no change | Employees see own; only admins/service-role can insert. **No employee mutation path** — point ledger integrity preserved. |
| `point_rewards` | ✅ no change | Active rewards public; admins manage. |
| `point_redemptions` | ✅ no change | Employees see/insert own (WITH CHECK ties `employee_id` to caller). Admin manages. The `point-redemption` edge function is the canonical path with audit; direct INSERT is bound to caller, no escalation possible. |
| `gacha_box_items` | ✅ no change | Catalog readable; service-role manages. |
| `employee_bag_items` | ⚠️→✅ **fixed** | Was missing employee SELECT policy. `RewardShop.tsx` was silently returning bag_count = 0 for all non-admin employees. **Added** `Employees can view own bag items` SELECT policy. **No** INSERT/UPDATE/DELETE policy was added — mutations stay admin/HR/service-role only. |

The new policy:

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

### Q&A summary

- _Can employees read only their own balances/items/redemptions?_ ✅ Yes after the fix.
- _Can employees directly insert/update/delete `point_transactions`?_ ❌ No — no employee policy exists.
- _Are mutations intended to go through edge functions?_ ✅ Yes — `point-redemption` is the canonical path and the only one that writes audit rows.
- _Can managers/admins see appropriate records?_ ✅ Admin sees all via `has_admin_access`. Manager has page access (`/attendance/happy-points`, `/attendance/point-transactions`, `/attendance/redemption-approvals`) per Phase 0A permission lockdown.
- _Is reward catalog readable where needed?_ ✅ `point_rewards` is_active=true is publicly readable.
- _Does MyPoints / reward shop still work after the change?_ ✅ Yes; the new policy unblocks the bag count read that was previously failing silently.

---

## 6. Notifications RLS — reviewed

| Policy | Verdict |
|---|---|
| `Employees can read own notifications` | ✅ Covers both `auth.jwt()->>'sub' = line_user_id` and `auth.users.id = e.line_user_id::uuid` mappings. |
| `Admins can read all notifications` | ✅ via `has_admin_access`. |
| `Admins can insert notifications` | ✅ Direct insert restricted to admins. **Service role bypasses RLS**, so existing edge-function writers (`remote-checkout-approval`, `point-redemption`, request-approval flows) keep working. |
| `Employees can update own notifications` | ✅ Covers mark-as-read. |
| (no DELETE policy) | ✅ Intentional — employees cannot delete notifications. |

No change needed. Manager/scope SELECT is not currently a feature in
the portal; nothing to widen.

---

## 7. Build / smoke results

See §10 for the verified output. Build passed; smoke scripts run-state
captured below.

---

## 8. Manual test checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | Employee A redeems own reward via portal | 200 + audit row, `employee_id=A` |
| 2 | Employee A tries to redeem with `employee_id=B` in body | 403 `forbidden_employee_mismatch`, denied audit |
| 3 | Employee A pulls gacha for own account | 200 + audit row |
| 4 | Manager approves a pending redemption | 200 + audit `action=approve` |
| 5 | `field`/`user` tries to approve a redemption | 403 from role guard |
| 6 | Manager approves `manager` (priority 5) remote checkout | ✅ 200, `priority_check_result=pass` |
| 7 | Manager tries to approve `owner`/`admin`/`hr` remote checkout | ❌ 403 `forbidden_role_priority`, denied audit row |
| 8 | Admin/owner approves any remote checkout | ✅ 200, `priority_check_result=bypass_admin` |
| 9 | Internal portal-data approve (manager → manager target) | ✅ 200 (priority resolved from `approver_employee_id`) |
| 10 | Internal portal-data approve (manager → owner target) | ❌ 403 (priority block applies on internal path too) |
| 11 | `liff-settings` GET as admin/owner | ✅ 200 |
| 12 | `liff-settings` GET as non-admin | ❌ 403 |
| 13 | Payroll notification triggered by HR/admin from `/attendance/payroll` | ✅ Sends LINE; one `send` audit row with counts |
| 14 | Branch report import via `/branch-reports` | ✅ Backfill runs; one `backfill` audit row with counts |
| 15 | Portal Reward Shop bag count visible for non-admin employee | ✅ Now shows real count (was 0 before RLS fix) |
| 16 | Portal Reward Shop reward catalog visible for any employee | ✅ Unchanged (`point_rewards` already public for active items) |

Run audit-row spot-checks via:

```sql
SELECT created_at, action_type, resource_type,
       performed_by_employee_id,
       metadata->>'function' AS fn,
       metadata->>'caller_role' AS role,
       metadata->>'priority_check_result' AS prio,
       metadata
FROM public.audit_logs
WHERE metadata->>'function' IN (
  'remote-checkout-approval','payslip-generator','payroll-notification',
  'backfill-work-sessions','backfill-work-sessions-time-based',
  'branch-report-backfill','report-generator'
)
ORDER BY created_at DESC
LIMIT 20;
```

---

## 9. Remaining risks

- **Pre-existing linter warnings** (extension in `public`, function
  search_path mutable, several `USING (true)` SELECT-only policies)
  predate Phase 0B and were not introduced by this work. None are
  Phase-0B blockers; track separately.
- **Receipts / Deposits admin menus** still visible to non-admins —
  flagged in 0A.2 risk list, deferred.
- **Payroll calculation / payslip math** still has no test coverage.
- **`point_redemptions`** still allows direct authenticated INSERT
  bound to the caller's own `employee_id` (WITH CHECK). The edge
  function is the canonical path; direct insert remains a defence-in-depth
  fallback and cannot escalate across employees.
- **`audit_logs` retention = 180 days** — anything needing longer
  storage must be exported before the daily 00:15 BKK cleanup runs.

---

## 10. Verdict

**READY FOR PHASE 1.**

Hard non-goals respected: no LINE webhook, no `attendance-submit`, no
`attendance-validate-token`, no `claim_attendance_token`, no Bangkok
timezone helpers, no payroll calculation math, no point-ledger semantics,
no portal check-in/check-out flow.
