# Phase 1C — Real-device Pilot QA Checklist

**Goal / เป้าหมาย:** Verify the daily flow on real devices: LINE → LIFF Portal → Check-in/out → Admin Ops Center.

**Out of scope:** No new features, no Employee Documents work, no changes to `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, Bangkok timezone helpers, payroll math, point ledger.

---

## Tester Metadata / ข้อมูลผู้ทดสอบ

| Field | Value |
|---|---|
| Tester name (initials only) / ชื่อย่อผู้ทดสอบ | |
| Tester role / บทบาท | owner / admin / hr / manager / employee |
| Device model / รุ่นเครื่อง | e.g. iPhone 13, Samsung A54 |
| OS + version / ระบบปฏิบัติการ | iOS 17.4 / Android 14 |
| LINE app version / เวอร์ชัน LINE | e.g. 14.7.0 |
| Network / เครือข่าย | Wi-Fi / 4G / 5G |
| Date & time (Asia/Bangkok) / วันเวลา | YYYY-MM-DD HH:mm |
| Branch (if employee) / สาขา | |
| Build / commit | |

---

## Severity Rubric / เกณฑ์ความรุนแรง

| Level | Meaning | Example |
|---|---|---|
| **S1 — Blocker** | Core flow broken, pilot must stop | Blank screen, cannot check-in, LIFF cannot init |
| **S2 — Major** | Flow works but degraded | >5s load, unclear error message, wrong copy |
| **S3 — Minor** | Cosmetic / UX polish | Small layout shift, icon misaligned |
| **S4 — Cosmetic** | Visual nit only | Color slightly off, kerning |

## Pilot Exit Criteria / เกณฑ์ผ่าน

- ✅ Zero S1 issues open
- ✅ ≤ 2 S2 issues, each with documented workaround
- ✅ p95 `portal_ready` < 2500 ms (see PHASE_1C_PERF_QUERIES)
- ✅ `token_validate_failed` rate < 5 %
- ✅ `checkin_submit_failed` rate < 3 %
- ✅ Ops Center accessible to all 4 intended roles, hidden from others

---

## A. Employee Portal inside LINE / พอร์ทัลพนักงานใน LINE

| # | Test / รายการทดสอบ | Pass criteria / เกณฑ์ผ่าน | Result | Load time (ms) | Severity | Notes |
|---|---|---|---|---|---|---|
| A1 | Open Rich Menu → tap portal icon | Portal opens inside LINE in-app browser | ☐ Pass ☐ Fail ☐ Blocked | | | |
| A2 | Skeleton appears immediately | Skeleton visible < 300 ms (no white flash) | ☐ Pass ☐ Fail ☐ Blocked | | | |
| A3 | Portal home renders | First content paint < 2.5 s | ☐ Pass ☐ Fail ☐ Blocked | | | |
| A4 | Attendance status loads | Today status (in/out/none) shown correctly | ☐ Pass ☐ Fail ☐ Blocked | | | |
| A5 | Check-in / Check-out button visible | Correct button shown for current state | ☐ Pass ☐ Fail ☐ Blocked | | | |
| A6 | No infinite loading | All spinners resolve within 5 s | ☐ Pass ☐ Fail ☐ Blocked | | | |
| A7 | No white screen at any point | No blank state during LIFF init | ☐ Pass ☐ Fail ☐ Blocked | | | |

## B. Outside LINE Fallback / กรณีเปิดนอก LINE

| # | Test | Pass criteria | Result | Severity | Notes |
|---|---|---|---|---|---|
| B1 | Open portal URL in Chrome / Safari | Friendly fallback page (open in LINE) shown | ☐ Pass ☐ Fail ☐ Blocked | | |
| B2 | No broken blank state | Page is readable, has clear next-step CTA | ☐ Pass ☐ Fail ☐ Blocked | | |
| B3 | Outside-LINE copy is in Thai | Thai message visible by default | ☐ Pass ☐ Fail ☐ Blocked | | |

## C. Check-in Token Flow / โฟลว์เช็คอินด้วยโทเค็น

| # | Test | Pass criteria | Result | Load time (ms) | Severity | Notes |
|---|---|---|---|---|---|---|
| C1 | Tap valid `/p/checkin?token=…` | Page opens, employee name visible | ☐ Pass ☐ Fail ☐ Blocked | | | |
| C2 | Open expired token | Thai error: "ลิงก์หมดอายุ" + retry CTA | ☐ Pass ☐ Fail ☐ Blocked | — | | |
| C3 | GPS permission allow | Lat/lng captured, geofence check runs | ☐ Pass ☐ Fail ☐ Blocked | | | |
| C4 | GPS permission deny → retry | Friendly Thai error + "ลองอีกครั้ง" works | ☐ Pass ☐ Fail ☐ Blocked | — | | |
| C5 | Camera permission allow | Camera preview appears | ☐ Pass ☐ Fail ☐ Blocked | | | |
| C6 | Camera permission deny → retry | Friendly error + retry works | ☐ Pass ☐ Fail ☐ Blocked | — | | |
| C7 | Liveness loads only when needed | MediaPipe lazy-loads only when liveness required | ☐ Pass ☐ Fail ☐ Blocked | | | |
| C8 | Submit success | Confirmation shown, no duplicate log | ☐ Pass ☐ Fail ☐ Blocked | | | |
| C9 | Double-tap submit | Only one log row created (relies on `submitLockRef`) | ☐ Pass ☐ Fail ☐ Blocked | — | | |
| C10 | Background → foreground mid-flow | State preserved, no white screen | ☐ Pass ☐ Fail ☐ Blocked | — | | |

## D. Manager / Admin Ops Center / ศูนย์ปฏิบัติการ

| # | Test | Pass criteria | Result | Severity | Notes |
|---|---|---|---|---|---|
| D1 | `/attendance/ops-center` loads for owner / admin / hr / manager | Page renders, no auth bounce | ☐ Pass ☐ Fail ☐ Blocked | | |
| D2 | `/attendance/ops-center` hidden / blocked for employee / field / user | Nav item not visible AND direct URL is blocked | ☐ Pass ☐ Fail ☐ Blocked | | |
| D3 | Today check-in / check-out counts visible | Numbers match Live Tracking | ☐ Pass ☐ Fail ☐ Blocked | | |
| D4 | Pending actions section | Items render or empty state shown | ☐ Pass ☐ Fail ☐ Blocked | | |
| D5 | Setup issues section | Missing LINE ID / branch counts shown | ☐ Pass ☐ Fail ☐ Blocked | | |
| D6 | Quick links navigate correctly | Each link routes to correct page | ☐ Pass ☐ Fail ☐ Blocked | | |
| D7 | `/attendance/portal-performance` accessible to same roles | KPIs render, charts non-empty after pilot traffic | ☐ Pass ☐ Fail ☐ Blocked | | |

---

## Issue Reporting Template / เทมเพลตรายงานปัญหา

For each Fail / Blocked, copy this block into the test result:

```
ID: <A1, C4, etc.>
Severity: S1 / S2 / S3 / S4
Summary: <one line>
Steps to reproduce:
  1.
  2.
  3.
Expected:
Actual:
Screenshot needed: Y / N
Perf event id (optional, no PII): <uuid from portal_performance_events>
Device / OS / LINE version:
Network:
```

> **PII rule / กฎ PII:** Do not paste tokens, line_user_id, raw GPS, photo URLs, or full names into bug reports. Use initials and the perf-event id.

---

## Sign-off / การยืนยันผลทดสอบ

| Role | Name (initials) | Date | Verdict |
|---|---|---|---|
| Pilot tester | | | ☐ READY ☐ NOT READY |
| Reviewer (admin) | | | ☐ READY ☐ NOT READY |

**Final verdict:** ☐ READY FOR SMALL PILOT  ☐ NOT READY — blockers: ______________________
