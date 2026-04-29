# Phase 0A finishing — 4 tasks

Scope is strictly additive. No changes to LINE webhook, attendance tokens, Bangkok timezone helpers, or payroll calculation math.

---

## Task 1 — Lock down `point-redemption` (P1 from STATUS.md)

**Problem.** `supabase/functions/point-redemption/index.ts` (441 lines) reads `employee_id` from the request body with zero auth, then uses the service-role client. Anyone with the public anon key can redeem / gacha / use bag items on any employee, or approve/reject other people's redemptions.

**Frontend callers (already use `supabase.functions.invoke`, JWT auto-attached):**
- `src/pages/portal/RewardShop.tsx` — `redeem`, `redeem_to_bag`
- `src/pages/portal/MyBag.tsx` — `use_bag_item`
- `src/pages/portal/GachaBox.tsx` — `gacha_pull`
- `src/pages/attendance/RedemptionApprovals.tsx` — `approve`, `reject`, `use`

So no frontend wiring change is needed; only server-side validation.

**Server fix (additive, no business-logic change):**

1. Add imports for `requireRole`, `authzErrorResponse`, `writeAuditLog`.
2. At the top of `serve(...)`, after CORS:
   - Call `requireRole(req, ['admin','owner','hr','manager','executive','moderator','field','user','employee'], { strict: false, functionName: 'point-redemption' })` to capture `userId` + `role` without rejecting.
   - If `userId` is null → return 401.
3. Resolve caller's `employees.id` via `employees.auth_user_id = userId` (use service-role client).
4. **Per-action authorization** (switch in `serve`):
   - `redeem`, `redeem_to_bag`, `use_bag_item`, `gacha_pull`:
     enforce `body.employee_id === caller.employee_id`. If mismatch → 403 `forbidden_employee_mismatch`. If caller has no employee record → 403.
   - `approve`, `reject`, `use`: require `role ∈ {admin, owner, hr, manager}`. Else 403.
5. After each successful action, call `writeAuditLog` with:
   - `functionName: 'point-redemption'`
   - `actionType: action` (`redeem|redeem_to_bag|approve|reject|use|use_bag_item|gacha_pull`)
   - `resourceType: 'point_redemption'`
   - `resourceId`: redemption id / reward id / bag item id depending on action
   - `performedByUserId: userId`
   - `performedByEmployeeId: caller.employee_id`
   - `callerRole: role`
   - `metadata: { target_employee_id, reward_id?, bag_item_id?, points?, balance_after? }`
6. Pass the `userId` / `caller.employee_id` / `role` into the helper functions (`processRedemption`, `approveRedemption`, `rejectRedemption`, `markAsUsed`, `useBagItem`, `gachaPull`) only as needed for the audit row. Do **not** rewrite their internal logic.
7. `gacha.ts` only needs an extra optional callback param or simply have the audit write happen in `index.ts` after `gachaPull` returns — keeps `gacha.ts` untouched (preferred).

No DB schema change. No change to `point_redemptions`, `point_rewards`, `happy_points`, or `employee_bag_items` tables.

---

## Task 2 — Fix risky raw-fetch + publishable-key callers in the frontend

Inventory found 3 files with raw `fetch` + `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`:

| File | Calls | Risk | Action |
|---|---|---|---|
| `src/pages/Attendance.tsx` (lines 86, 134, 238, 330, 486, 543, 607) | `holidays` REST + 5 edge functions (`attendance-validate-token`, `attendance-submit`, `overtime-request`, `early-checkout-request`, `remote-checkout-request`) | **Low — public/token-gated.** This is the unauthenticated check-in page reached via one-time token. Users here are NOT logged into Supabase Auth, so `supabase.functions.invoke` would attach no JWT and the anon key fallback is exactly the intended behavior. | **Do NOT change.** Document as accepted-risk in STATUS.md (token is the auth boundary). |
| `src/lib/offline-queue.ts` (lines 128, 200) | `attendance-submit` (queued) + `health` | Same as above — runs from the token-gated check-in page. | **Do NOT change.** Same accepted-risk justification. |
| `src/components/settings/LiffSettingsCard.tsx` (lines 48, 70) | `liff-settings` (`get` + `update-endpoint`) | **High — admin settings page.** Uses raw fetch with publishable key as `apikey` only (no Bearer JWT), so any non-admin who hits the function URL with the public key can read/update LIFF endpoint config. Rendered inside the admin Dashboard. | **FIX:** Replace both `fetch` calls with `supabase.functions.invoke('liff-settings', { method: 'GET'/'POST', body, ... })`. Then add `requireRole(req, ['admin','owner'])` + `writeAuditLog` to `supabase/functions/liff-settings/index.ts` (currently unguarded — confirm during implementation). |

The fix to `LiffSettingsCard.tsx` is the only frontend code change.

(`src/integrations/supabase/client.ts` is the canonical Supabase client init — left untouched per project rule.)

---

## Task 3 — Configure `audit_logs` retention + document policy

**Current state:** 85 rows, oldest 2025-11-26. Indexed on `created_at DESC`. No retention.

**Implementation (migration):**

1. Create SQL function `public.cleanup_audit_logs(retention_days int default 180)` (`SECURITY DEFINER`, `search_path=public`):
   - `DELETE FROM public.audit_logs WHERE created_at < now() - (retention_days || ' days')::interval RETURNING id;`
   - Returns count of deleted rows.
2. Schedule a `pg_cron` job (via `insert tool`, NOT migration, because it embeds the project URL + anon key for `net.http_post`). Simpler: schedule `SELECT public.cleanup_audit_logs(180);` directly in cron — no edge function needed. Run nightly at `15 17 * * *` UTC = 00:15 Bangkok.
3. Job name: `audit-logs-cleanup-daily`.

**Retention policy:** 180 days. Rationale:
- Covers 2 quarterly review cycles + 1 monthly audit.
- All current audit categories (approvals, backfills, sends, redemptions) are operational, not legal/financial — no statutory retention requirement.
- Matches Lovable Cloud's default Postgres backup window comfortably.

Document in `docs/STATUS.md` under a new "Audit logging" section with: retention window, cron job name + schedule, function name, manual override command, and a note that any rows requiring longer retention should be exported to a separate archive table before the cron runs.

---

## Task 4 — Add `writeAuditLog` to remaining guarded functions

Per current state of each file, these functions have `requireRole` but no `writeAuditLog`:

| Function | Action type | Resource type | Metadata to capture |
|---|---|---|---|
| `admin-response-points-rollback` | `rollback` | `points` | `date`, `reason`, `processed_count`, `affected_employees`, `total_reversed` |
| `payslip-generator` | `generate` | `payslip` | `employee_id`, `period_start`, `period_end`, `net_pay` (no PII beyond what's already in audit) |
| `payroll-notification` | `notify` | `payroll` | `period`, `recipient_count`, `sent`, `failed` |
| `fix-user-names` | `maintenance` | `users` | `updated_count`, `mode` |
| `backfill-primary-groups` | `backfill` | `users` | `updated_count` |
| `backfill-work-sessions` | `backfill` | `work_sessions` | `inserted`, `updated`, `skipped`, `range` |
| `backfill-work-sessions-time-based` | `backfill` | `work_sessions` | same shape as above |
| `branch-report-backfill` | `backfill` | `branch_reports` | `processed`, `range` |
| `report-generator` (manual path only — skip the `auto_summary` cron path) | `generate` | `report` | `report_type`, `range`, `recipient_group_id?` |

Pattern: write a single audit row on the success-path, after the work completes, before returning the response. Use the `userId` + `role` already returned by `requireRole`. **Never** add audit writes to the cron-secret bypass path of `report-generator`.

`liff-settings` (added in Task 2) gets the same treatment: `actionType: 'get' | 'update_endpoint'`, `resourceType: 'liff_settings'`.

---

## Verification checklist

1. `npm run build` passes.
2. `npm run smoke:quick` passes.
3. Manual:
   - Portal user A tries `point-redemption` with `employee_id` of user B → 403.
   - Portal user A redeems for self → 200 + audit row written.
   - Non-admin tries `liff-settings` `get` → 403.
   - Admin opens `LiffSettingsCard` → loads + can update endpoint.
4. SQL: `SELECT cron.schedule WHERE jobname='audit-logs-cleanup-daily';` returns 1 row.
5. SQL: `SELECT public.cleanup_audit_logs(99999);` returns 0 (sanity, no rows that old).
6. SQL: `SELECT count(*) FROM audit_logs WHERE metadata->>'function' IN ('point-redemption','admin-response-points-rollback','payslip-generator','payroll-notification','fix-user-names','backfill-primary-groups','backfill-work-sessions','backfill-work-sessions-time-based','branch-report-backfill','report-generator','liff-settings');` returns >0 after a sample call to each.

---

## Files that will change

**Edge functions (audit + guard additions only):**
- `supabase/functions/point-redemption/index.ts` (auth + ownership + audit)
- `supabase/functions/admin-response-points-rollback/index.ts`
- `supabase/functions/payslip-generator/index.ts`
- `supabase/functions/payroll-notification/index.ts`
- `supabase/functions/fix-user-names/index.ts`
- `supabase/functions/backfill-primary-groups/index.ts`
- `supabase/functions/backfill-work-sessions/index.ts`
- `supabase/functions/backfill-work-sessions-time-based/index.ts`
- `supabase/functions/branch-report-backfill/index.ts`
- `supabase/functions/report-generator/index.ts` (manual path only)
- `supabase/functions/liff-settings/index.ts` (add `requireRole` + audit)

**Frontend:**
- `src/components/settings/LiffSettingsCard.tsx` (switch to `supabase.functions.invoke`)

**Docs / DB:**
- New migration: `cleanup_audit_logs(int)` function.
- DB insert (via insert tool, not migration): `cron.schedule` for nightly cleanup.
- `docs/STATUS.md`: new "Audit logging & retention" section, mark Phase 0B items 1, 2, 3, 4 done, update P1 to resolved.

**Untouched (per protected list):**
- `line-webhook/**`, `_shared/timezone.ts`, `claim_attendance_token` SQL, `attendance-submit/**`, `attendance-validate-token/**`, payroll math in `Payroll.tsx` / `payslip-generator` math (we only add an audit row, no calculation change), `src/pages/Attendance.tsx`, `src/lib/offline-queue.ts`, `src/integrations/supabase/client.ts`.

---

## Out of scope (intentionally deferred)

- Refactoring `Attendance.tsx` raw-fetch calls → it's a token-gated unauthenticated page, the anon-key bearer is correct.
- Adding audit to `dm-send` / `broadcast-send` / etc. — already have audit (Phase 0A.1).
- Receipts/Deposits permission cleanup — deferred per STATUS.md.
- Any HR feature work — Phase 1.
