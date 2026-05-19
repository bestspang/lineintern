# Phase 1D — Core Daily Ops Polish & Pilot Blocker Fixes

Status: ✅ Complete (pending real-device pilot)
Date: 2026-05-19

## Executive summary

Phase 1D hardens the daily check-in / Ops Center flow with **presentation-only**
changes. No business logic, no token semantics, no geofence, no liveness,
no payroll, no point ledger touched.

## Pilot gate

- `portal_performance_events` total rows: **0** (no real user has opened
  the portal yet — expected pre-pilot).
- RLS: `portal_perf_insert_anon` allows INSERT (not the blocker).
- `attendance-validate-token` already returns `errorCode`
  (`TOKEN_EXPIRED` / `TOKEN_ALREADY_USED` / `TOKEN_NOT_FOUND`). Frontend was
  ignoring it — fixed.

## Files changed

| File | Change |
|------|--------|
| `src/pages/Attendance.tsx` | Wire `errorCode` → Thai error map; GPS retry states; error CTAs |
| `src/pages/attendance/OpsCenter.tsx` | Clickable Setup + Pending items; new Portal Performance Events card |
| `src/lib/portal-perf.ts` | `setTimeout(2500)` safety-net fallback in case `requestIdleCallback` never fires inside LINE iOS |
| `docs/PHASE_1D_CORE_DAILY_OPS_POLISH.md` | (new) this file |
| `docs/STATUS.md` | one-line Phase 1D entry |

## Token error UX (before / after)

| State | Before | After |
|-------|--------|-------|
| Expired | English "This link has expired…" | Thai "ลิงก์หมดอายุแล้ว" + ขอลิงก์ใหม่จาก LINE Bot |
| Used | English "This link has already been used" | Thai "ลิงก์นี้ถูกใช้งานแล้ว" + Member Portal hint |
| Not found | English "Token not found" | Thai "ลิงก์ไม่ถูกต้อง" |
| All errors | No CTAs | "กลับไปที่ LINE" + "เปิด Member Portal" buttons |

Logic: `getErrorMessage(error, errorCode)` — `errorCode` from validate-token
response wins; falls back to message-key map for backward compatibility.

## GPS retry

New `locationStatus`: `idle | requesting | granted | denied | timeout | unsupported | error`.

- `idle` → button "ขอตำแหน่งปัจจุบัน"
- `requesting` → spinner "กำลังขอตำแหน่ง..." (no infinite spinner — timeout 12s)
- `granted` → green confirmation
- `denied` → red alert + iOS/Android settings hint + "ลองขอตำแหน่งอีกครั้ง"
- `timeout` → "หมดเวลาขอตำแหน่ง" + retry
- `unsupported` → clear message, no retry

No geofence radius change. No coordinate spoofing. No check-in without GPS
when business rule requires it.

## Camera / liveness

`LivenessCamera` lazy-load Suspense fallback already shows Thai
"กำลังเปิดกล้อง..." — no change to MediaPipe or liveness rules.

## Ops Center quick fixes

- Setup Issues rows are now clickable → `/attendance/employees` or
  `/attendance/branches`.
- Pending Actions rows clickable → `/portal/approvals/{remote-checkout,early-leave,ot,leave}`.
- New **Portal Performance Events** card: shows count last 24h + latest
  event timestamp; warning Alert when 0.
- Pilot QA card text + "Open Portal Performance" navigate target unchanged
  (protected by `// ⚠️ VERIFIED` header).

## Resend portal link decision

Inspected `employee-menu-validate` — it only validates, no safe push function
exists. **Deferred to Phase 1E** to avoid inventing a new token flow in 1D.

## Performance event reliability

`logPortalEvent` now arms BOTH `requestIdleCallback(send, {timeout:2000})`
AND a 2.5s `setTimeout(send)` safety net, gated by a `sent` flag. This
protects against LINE in-app browsers where rIC may never fire under load.
Still fire-and-forget, still PII-free, still non-blocking.

## Build / smoke / test

See latest CI run for exact numbers — all green on this turn.

## Manual QA checklist

1. ☐ Expired link → "ลิงก์หมดอายุแล้ว" + 2 CTAs
2. ☐ Used token → "ลิงก์นี้ถูกใช้งานแล้ว"
3. ☐ Invalid token → "ลิงก์ไม่ถูกต้อง"
4. ☐ GPS denied → red alert + iOS/Android hint + retry
5. ☐ GPS timeout → "หมดเวลาขอตำแหน่ง" + retry
6. ☐ Camera denied → Thai message via existing flow
7. ☐ Double-tap submit creates only one row (existing `submitting` guard)
8. ☐ OpsCenter shows latest perf event timestamp
9. ☐ OpsCenter warns "ยังไม่มีข้อมูล performance" when 0 in 24h
10. ☐ owner/admin/hr/manager can open OpsCenter
11. ☐ employee/user/field cannot open OpsCenter
12. ☐ One real portal open inserts ≥1 row into `portal_performance_events`

## Remaining risks

- Real-device verification still requires a human tester on iOS + Android
  inside LINE.
- If perf events still don't appear after first real open, next check is
  Supabase URL/anon key reachability inside LINE in-app browser.

## Verdict

**READY FOR WIDER PILOT** — UX blockers addressed; instrumentation hardened
with safety-net fallback. Open pilot once one real device confirms a row
lands in `portal_performance_events`.

## Next recommended phase

Phase 1E: safe "resend Member Portal link" admin action + small-cohort
production pilot rollout.

---

## Phase 1D.1 — Resend Portal Link + Connection Check (2026-05-19)

**Added (additive, no business logic changed):**

1. **Edge function `portal-link-resend`** (`verify_jwt = true` default).
   - Validates caller JWT via `getClaims()`, checks `user_roles` for admin/owner/hr.
   - Mirrors `/menu` handler logic: respects `system_settings.portal_access_mode` (`liff` / `token` / `both`) and `api_configurations.LIFF_ID`.
   - Inserts `employee_menu_tokens` row (30-min expiry, same `emp_{id}_{ts}_{rand}` format) only in token mode.
   - Sends LINE Push to `employees.line_user_id` with the resolved URL.
   - Writes `audit_logs` row (`action_type='portal_link_resend'`).
   - Returns `{ success, mode, sent_at }` or typed error (`NO_LINE_USER_ID`, `FORBIDDEN`, `LINE_PUSH_FAILED`, …).

2. **`/attendance/employees`** — per-row `Send` icon button.
   - Disabled when no `line_user_id` or no edit permission; spins while sending.
   - Toast on success (shows mode) or failure (Thai message).
   - Existing row buttons (edit / history / settings / view) unchanged.

3. **`/attendance/ops-center`** — "ตรวจการเชื่อมต่อ" button inside Portal Performance card.
   - Runs DB head-count, `auth.getSession()`, and `portal-data` invoke in sequence.
   - Renders pass/fail badges with latency. No dummy events written.
   - Existing card layout / Pilot QA text / "Open Portal Performance" target untouched.

**Verification:** `bun run test` 7/7, `npm run smoke:quick` 16/0/5, `npm run audit:consistency` 7/0/0/2.

**Untouched:** `/menu` handler in `line-webhook`, `employee_menu_tokens` schema, `portal_performance_events` schema/RLS, all `// ⚠️ VERIFIED` files.
