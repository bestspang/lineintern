# Phase 1C — Pilot Results / ผลทดสอบ Pilot จริง

> **Purpose / วัตถุประสงค์:** Capture the outcome of real-device pilot QA.
> **Source checklists / เช็คลิสต์ต้นทาง:** [`PHASE_1B_QA_CHECKLIST.md`](./PHASE_1B_QA_CHECKLIST.md), [`PHASE_1C_PILOT_QA.md`](./PHASE_1C_PILOT_QA.md)
> **Perf queries / คิวรีประสิทธิภาพ:** [`PHASE_1C_PERF_QUERIES.md`](./PHASE_1C_PERF_QUERIES.md)
> **PII rule:** Initials only. Never paste tokens, line_user_id, raw GPS, photo URLs, or full names.

---

## 1. Tester List / รายชื่อผู้ทดสอบ

| # | Initials | Role | Branch | Notes |
|---|---|---|---|---|
| 1 | | owner / admin / hr / manager / employee / field / user | | |
| 2 | | | | |
| 3 | | | | |

## 2. Device List / อุปกรณ์ที่ใช้

| # | Tester | Model | OS + version | DPR | Notes |
|---|---|---|---|---|---|
| 1 | | iPhone 13 / Samsung A54 / … | iOS 17.4 / Android 14 | 2 / 3 | |
| 2 | | | | | |

## 3. LINE App Version / เวอร์ชัน LINE

| Tester | LINE version |
|---|---|
| | e.g. 14.7.0 |

## 4. Network Type / เครือข่าย

| Tester | Network | Notes |
|---|---|---|
| | Wi-Fi / 4G / 5G | |

## 5. Test Account / Role / บัญชีทดสอบ

| Tester | Account (initials) | Role | Reason |
|---|---|---|---|
| | | owner / admin / hr / manager / employee / field / user | e.g. verify role gating |

## 6. Test Branch / สาขาทดสอบ

| Branch | Geofence configured? | LINE group linked? |
|---|---|---|
| | ☐ Yes ☐ No | ☐ Yes ☐ No |

## 7. Start / End Time (Asia/Bangkok)

| Field | Value |
|---|---|
| Start | YYYY-MM-DD HH:mm |
| End   | YYYY-MM-DD HH:mm |
| Build / commit | |

---

## 8. PASS / PARTIAL / FAIL Counts

| Area | Total | Pass | Partial | Fail | Blocked |
|---|---|---|---|---|---|
| A. Employee Portal in LINE | | | | | |
| B. Outside-LINE Fallback   | | | | | |
| C. Check-in Token Flow     | | | | | |
| D. Manager / Admin Ops     | | | | | |
| **Total**                  | | | | | |

## 9. Blocker List / รายการบล็อกเกอร์

For each S1 / S2 issue, copy this block (no PII):

```
ID: <A1, C4, etc.>
Severity: S1 / S2
Summary:
Steps to reproduce:
  1.
  2.
  3.
Expected:
Actual:
Device / OS / LINE version:
Network:
Perf event id (optional):
Screenshot ref (filename only):
```

## 10. Screenshots / Evidence Links

- **Storage location:** _(internal drive / Notion page / shared folder — fill in)_
- **Naming convention:** `phase1c_<area><id>_<initials>_<YYYYMMDD>.png`
  - Example: `phase1c_C4_AA_20260429.png`
- **Rule:** No tokens, no real names, no raw GPS, no photo URLs in the image.

| # | Filename | Linked test ID | Tester |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

## 11. Portal Performance Snapshot

Capture from `/attendance/portal-performance` immediately after the pilot window closes.

| Field | Value |
|---|---|
| Snapshot time (Asia/Bangkok) | YYYY-MM-DD HH:mm |
| Window covered | last 24h / last 7d |
| `portal_ready` p50 (ms) | |
| `portal_ready` p95 (ms) | |
| `liff_init_done` p50 (ms) | |
| `liff_init_done` p95 (ms) | |
| `checkin_submit_ok` count | |
| `checkin_submit_failed` count | |
| `token_validate_failed` count | |
| Error rate % | |

> Cross-check with SQL templates in `PHASE_1C_PERF_QUERIES.md`.

---

## 12. Pass / Fail Gates

### ✅ READY FOR SMALL PILOT — all of the below must be true
- 0 blockers (S1)
- No white screen on any tested device
- No duplicate attendance log rows
- Check-in **and** check-out succeed on at least one Android **and** one iPhone
- `/attendance/ops-center` loads for admin / hr / manager
- `/attendance/portal-performance` shows events (non-empty KPIs)
- `field` and `user` roles **cannot** access ops-center or portal-performance
- Expired link shows an understandable Thai error

### ❌ NOT READY — any one of the below
- Blank screen when opening portal in LINE
- LIFF init loop / cannot initialize
- Check-in cannot submit
- Duplicate attendance row created
- GPS or camera denial cannot be recovered (no retry path)
- Role access leak (lower role sees admin pages)
- Performance dashboard empty despite events being collected

---

## 13. Sign-off / การยืนยันผล

| Role | Initials | Date | Verdict |
|---|---|---|---|
| Pilot lead     | | | ☐ READY ☐ NOT READY |
| Reviewer (admin) | | | ☐ READY ☐ NOT READY |

**Final verdict:** ☐ READY TO RUN PILOT  ☐ NOT READY — blockers: ______________________
