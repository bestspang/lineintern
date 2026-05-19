# Phase 1E — Controlled Pilot Runbook / คู่มือ Pilot รอบควบคุม

> **Mode:** Real-device pilot. Only fix issues that actually appear in the field.
> **Out of scope:** new features, refactors, polish, any `// ⚠️ VERIFIED` file body, `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, Bangkok TZ helpers, payroll math, point ledger.
> **PII rule:** initials only. Never paste tokens, `line_user_id`, raw GPS, photo URLs, or full names.

Companion docs: [`PHASE_1B_QA_CHECKLIST.md`](./PHASE_1B_QA_CHECKLIST.md), [`PHASE_1C_PILOT_QA.md`](./PHASE_1C_PILOT_QA.md), [`PHASE_1C_PERF_QUERIES.md`](./PHASE_1C_PERF_QUERIES.md), [`PHASE_1E_DRIFT_REPORT.md`](./PHASE_1E_DRIFT_REPORT.md).

---

## 1. Pilot Metadata / ข้อมูลรอบ Pilot

| Field | Value |
|---|---|
| Pilot start (Asia/Bangkok) | YYYY-MM-DD HH:mm |
| Pilot end (Asia/Bangkok)   | YYYY-MM-DD HH:mm |
| Pilot branch | |
| Live URL | https://intern.gem.me  /  https://lineintern.lovable.app |
| Frontend build / commit | |
| LINE webhook ref (must = LIVE) | `bjzzqfzgnslefqhnsmla` |
| Pilot lead (initials) | |

## 2. Tester Roster / รายชื่อผู้ทดสอบ

| # | Initials | Role | Phone model | OS + ver | LINE ver | Network | Test account (initials) |
|---|---|---|---|---|---|---|---|
| 1 | | owner/admin/hr/manager/employee/field/user | | | | Wi-Fi / 4G / 5G | |
| 2 | | | | | | | |
| 3 | | | | | | | |

## 3. Pre-Pilot Readiness Check / ตรวจความพร้อมก่อนเริ่ม

Source-verified from sandbox before pilot (no real-device interaction yet).

| Route | Source verified | Notes |
|---|---|---|
| `/overview` | ✅ `App.tsx:173` + `ProtectedRoute` | Admin gate via `usePageAccess` |
| `/attendance/ops-center` | ✅ `App.tsx:307` | owner/admin/hr/manager only |
| `/attendance/portal-performance` | ✅ `App.tsx:308` | same gating as ops-center |
| `/portal/*` | ✅ `App.tsx:180` | `PortalLayout` + LIFF fallback |
| `/attendance?t=<token>` | ✅ `App.tsx:173` | Thai error map in `Attendance.tsx` |
| Published site | ✅ public, build live | `publish_settings.effective_publish_visibility = public` |
| `portal_performance_events` table | ✅ exists, empty over last 7 days | Awaiting first real tester |

## 4. Severity Rubric / เกณฑ์ความรุนแรง

| Level | Meaning |
|---|---|
| **S1 — Blocker** | Blank screen, LIFF init loop, check-in/out submit fails, duplicate attendance row, GPS/camera retry broken, perf events not inserted after confirmed usage |
| **S2 — Major** | Recoverable but affects daily use, role gating leak, slow (>5s) load on 4G |
| **S3 — Minor** | Confusing copy or UX |
| **S4 — Cosmetic** | Visual nit |

## 5. Test Cases / รายการทดสอบ

> Mark **PASS / PARTIAL / FAIL / BLOCKED** per row. Add severity for any non-pass.

### A. LINE Portal entry

| # | Test | Result | Sev | Notes |
|---|---|---|---|---|
| A1 | Open from LINE rich menu (cold start) | | | |
| A2 | Warm start (already in LINE) | | | |
| A3 | Outside-LINE fallback in mobile Safari/Chrome | | | |
| A4 | Slow 4G (throttled) | | | |

### B. Check-in / Check-out

| # | Test | Result | Sev | Notes |
|---|---|---|---|---|
| B1 | Valid check-in | | | |
| B2 | Valid check-out | | | |
| B3 | Expired token shows Thai message | | | |
| B4 | Already-used token shows Thai message | | | |
| B5 | Invalid/garbage token shows Thai message | | | |
| B6 | Double-tap submit → only 1 row | | | |
| B7 | Offline mid-submit then reconnect | | | |
| B8 | Outside geofence → blocked with Thai message | | | |

### C. GPS / Camera permissions

| # | Test | Result | Sev | Notes |
|---|---|---|---|---|
| C1 | GPS allow | | | |
| C2 | GPS deny → retry works | | | |
| C3 | GPS timeout (12s) → Thai error | | | |
| C4 | Camera allow | | | |
| C5 | Camera deny → retry works | | | |

### D. Admin / Manager surfaces

| # | Test | Result | Sev | Notes |
|---|---|---|---|---|
| D1 | `/attendance/ops-center` loads for owner/admin/hr/manager | | | |
| D2 | `/attendance/portal-performance` loads for same roles | | | |
| D3 | Today's counts roughly match Live Tracking | | | |
| D4 | Pending requests section renders | | | |
| D5 | Setup-issues section renders | | | |
| D6 | employee/field/user **cannot** reach D1/D2 | | | |

## 6. Blocker Log / รายการบล็อกเกอร์

For each S1/S2, copy and fill (no PII):

```
ID: <A1, C3, ...>
Severity: S1 / S2
Summary:
Steps to reproduce:
  1.
  2.
Expected:
Actual:
Device / OS / LINE ver:
Network:
Perf event id (if any):
Screenshot ref (filename only):
```

## 7. Performance Event Snapshot / สแน็ปช็อต portal_performance_events

Run after first batch of tester traffic. Reference SQL: [`PHASE_1C_PERF_QUERIES.md`](./PHASE_1C_PERF_QUERIES.md).

```sql
-- last 2 hours
SELECT event_name, count(*), max(created_at)
FROM portal_performance_events
WHERE created_at > now() - interval '2 hours'
GROUP BY event_name
ORDER BY 2 DESC;
```

| Field | Value |
|---|---|
| Snapshot time (Asia/Bangkok) | |
| Window | last 2h / last 24h |
| Total events | |
| Latest event time | |
| Event names seen | |
| `portal_ready` p50 / p95 (ms) | |
| `liff_init_done` p50 / p95 (ms) | |
| Top `error_code` (if any) | |

**Pre-pilot baseline (this runbook commit):** 0 events in the last 7 days — table empty, awaiting first real tester. This is expected, not a regression.

If still **0 events after confirmed real usage** → S1. Investigation order:
1. RLS on `portal_performance_events` (insert allowed for anon/authenticated).
2. `logPortalEvent` fallback in `src/lib/portal-perf.ts` (rIC + 2.5s setTimeout safety net — confirm not regressed).
3. Auth context / supabase client init order on portal cold start.

## 8. Final Checks / ตรวจสุดท้าย

| Command | Result | Notes |
|---|---|---|
| `npm run check` | | audit + smoke combined |
| `bun run test` | | unit/integration |
| `npm run build` (only if a fix landed) | | |

## 9. Exit Criteria / เกณฑ์ผ่าน

- ✅ Zero S1 open
- ✅ ≤ 2 S2 open, each with documented workaround
- ✅ Check-in and check-out succeed on at least 1 Android **and** 1 iPhone
- ✅ `/attendance/ops-center` reachable by owner/admin/hr/manager
- ✅ employee/field/user blocked from admin pages
- ✅ `portal_performance_events` shows non-zero count for `portal_ready` or `liff_init_done`

## 10. Sign-off / ยืนยันผล

| Role | Initials | Date | Verdict |
|---|---|---|---|
| Pilot lead | | | ☐ READY FOR WIDER PILOT  ☐ NOT READY |
| Reviewer (admin) | | | ☐ READY FOR WIDER PILOT  ☐ NOT READY |

**Final verdict:** ☐ READY FOR WIDER PILOT  ☐ NOT READY — blockers: ______________________
