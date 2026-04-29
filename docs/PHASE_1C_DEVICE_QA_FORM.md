# Phase 1C — Device QA Capture Form / ฟอร์มจับผลทดสอบต่ออุปกรณ์

> **วิธีใช้:** ใช้ "1 อุปกรณ์ = 1 form block". Copy block ใน §2 เพื่อทดสอบเครื่องถัดไป. หลังครบทุกเครื่อง ให้สรุป aggregate กลับไปที่ [`PHASE_1C_PILOT_RESULTS.md`](./PHASE_1C_PILOT_RESULTS.md) ส่วน 8 (PASS/PARTIAL/FAIL counts) และ ส่วน 11 (Performance Snapshot)
>
> **Reference:** test cases เต็มอยู่ที่ [`PHASE_1C_PILOT_QA.md`](./PHASE_1C_PILOT_QA.md) · perf queries [`PHASE_1C_PERF_QUERIES.md`](./PHASE_1C_PERF_QUERIES.md) · rollback gate [`PHASE_1C_ROLLBACK_SAFE_CHECKLIST.md`](./PHASE_1C_ROLLBACK_SAFE_CHECKLIST.md)

> ⚠️ **PII rule / กฎ PII (อ่านก่อนเริ่ม):**
> ห้ามใส่ token, line_user_id, ชื่อจริงเต็ม, raw GPS coordinate, photo URL, หรือ stack trace ลงในฟอร์มนี้.
> ใช้ **อักษรย่อ (initials)** สำหรับชื่อคน, **perf event id (uuid)** สำหรับอ้างอิงเหตุการณ์, และไฟล์ screenshot ต้องตั้งชื่อตามรูปแบบใน §4.

---

## 1. Severity Legend / เกณฑ์ความรุนแรง (สรุปย่อ)

| Level | Meaning |
|---|---|
| **S1** | Blocker — pilot ต้องหยุด (ดู rollback triggers) |
| **S2** | Major — ใช้งานได้แต่แย่ลงชัดเจน |
| **S3** | Minor — UX polish |
| **S4** | Cosmetic — ความสวยงามล้วน |

ผลแต่ละข้อ: **PASS** / **FAIL** / **BLOCKED** / **N/A**

---

## 2. Per-Device Form Block / บล็อกฟอร์มต่อ 1 อุปกรณ์

> Copy ตั้งแต่หัวข้อ "### Device #__" ไปจนจบ "Per-device verdict" สำหรับเครื่องถัดไป

---

### Device #__

#### Header / ข้อมูลอุปกรณ์

| Field | Value |
|---|---|
| Device ID (e.g. D1, D2 — ใช้ในชื่อไฟล์ log) | |
| Tester (initials) | |
| Tester role | owner / admin / hr / manager / employee / field / user |
| Branch (ถ้าเป็น employee) | |
| Model | e.g. iPhone 13 / Samsung A54 |
| OS + version | iOS 17.4 / Android 14 |
| DPR (devicePixelRatio) | 2 / 3 |
| LINE app version | e.g. 14.7.0 |
| Network | ☐ Wi-Fi ☐ 4G ☐ 5G — provider/SSID (ย่อ): _____ |
| Test date/time start (Asia/Bangkok) | YYYY-MM-DD HH:mm |
| Test date/time end (Asia/Bangkok) | YYYY-MM-DD HH:mm |
| Commit hash | |

#### Section A — LIFF / Portal Cold Start

| # | Test | Result | Load (ms) | Severity | Notes |
|---|---|---|---|---|---|
| A1 | Rich Menu → portal opens in LINE | ☐ PASS ☐ FAIL ☐ BLOCKED | | | |
| A2 | Skeleton appears < 300 ms | ☐ PASS ☐ FAIL ☐ BLOCKED | | | |
| A3 | First content paint < 2.5 s | ☐ PASS ☐ FAIL ☐ BLOCKED | | | |
| A4 | Today attendance status correct | ☐ PASS ☐ FAIL ☐ BLOCKED | | | |
| A5 | Correct check-in/out button shown | ☐ PASS ☐ FAIL ☐ BLOCKED | | | |
| A6 | All spinners resolve < 5 s | ☐ PASS ☐ FAIL ☐ BLOCKED | | | |
| A7 | No white screen during LIFF init | ☐ PASS ☐ FAIL ☐ BLOCKED | | | |

#### Section B — Outside-LINE Fallback

| # | Test | Result | Severity | Notes |
|---|---|---|---|---|
| B1 | Open portal URL in Chrome/Safari → friendly fallback | ☐ PASS ☐ FAIL ☐ BLOCKED | | |
| B2 | Fallback page readable + clear CTA | ☐ PASS ☐ FAIL ☐ BLOCKED | | |
| B3 | Thai copy default | ☐ PASS ☐ FAIL ☐ BLOCKED | | |

#### Section C — Check-in Token Flow

| # | Test | Result | Network | Submit (ms) | Severity | Notes |
|---|---|---|---|---|---|---|
| C1 | Tap valid `/p/checkin?token=…` | ☐ PASS ☐ FAIL ☐ BLOCKED | | | | |
| C2 | Open expired token → Thai error + retry | ☐ PASS ☐ FAIL ☐ BLOCKED | | — | | |
| C3 | GPS allow → geofence runs | ☐ PASS ☐ FAIL ☐ BLOCKED | | | | |
| C4 | GPS deny → friendly retry works | ☐ PASS ☐ FAIL ☐ BLOCKED | | — | | |
| C5 | Camera allow → preview appears | ☐ PASS ☐ FAIL ☐ BLOCKED | | | | |
| C6 | Camera deny → friendly retry works | ☐ PASS ☐ FAIL ☐ BLOCKED | | — | | |
| C7 | MediaPipe lazy-loads only when needed | ☐ PASS ☐ FAIL ☐ BLOCKED | | | | |
| C8 | Submit success → confirmation, no dup log | ☐ PASS ☐ FAIL ☐ BLOCKED | | | | |
| C9 | Double-tap submit → only 1 row created | ☐ PASS ☐ FAIL ☐ BLOCKED | | — | | |
| C10 | Background → foreground mid-flow OK | ☐ PASS ☐ FAIL ☐ BLOCKED | | — | | |

#### Section D — Manager / Admin Ops Center

(ทดสอบเฉพาะถ้า role เป็น owner/admin/hr/manager. ถ้า role อื่น ให้ทดสอบ D2 = ต้องถูกบล็อก)

| # | Test | Result | Severity | Notes |
|---|---|---|---|---|
| D1 | `/attendance/ops-center` โหลดสำเร็จ | ☐ PASS ☐ FAIL ☐ BLOCKED ☐ N/A | | |
| D2 | Hidden+blocked สำหรับ employee/field/user | ☐ PASS ☐ FAIL ☐ BLOCKED ☐ N/A | | |
| D3 | Today check-in/out counts ตรงกับ Live Tracking | ☐ PASS ☐ FAIL ☐ BLOCKED ☐ N/A | | |
| D4 | Pending actions render | ☐ PASS ☐ FAIL ☐ BLOCKED ☐ N/A | | |
| D5 | Setup issues counts ถูกต้อง | ☐ PASS ☐ FAIL ☐ BLOCKED ☐ N/A | | |
| D6 | Quick links navigate ถูกหน้า | ☐ PASS ☐ FAIL ☐ BLOCKED ☐ N/A | | |
| D7 | `/attendance/portal-performance` เปิดได้ + KPI ไม่ว่าง | ☐ PASS ☐ FAIL ☐ BLOCKED ☐ N/A | | |

#### Performance Capture (per device) / ค่าประสิทธิภาพ

ดึงจาก `/attendance/portal-performance` หรือ SQL ใน `PHASE_1C_PERF_QUERIES.md` § 1.

| Metric | Window | p50 (ms) | p95 (ms) | Samples |
|---|---|---|---|---|
| `portal_ready` | ☐ 24h ☐ 7d | | | |
| `liff_init_done` | ☐ 24h ☐ 7d | | | |
| `token_validate_success` | ☐ 24h ☐ 7d | | | |
| `checkin_submit_success` | ☐ 24h ☐ 7d | | | |

| Failure metric | Count (24h) | Notes |
|---|---|---|
| `token_validate_failed` (excl. expired/not_found) | | |
| `checkin_submit_failed` | | |

#### Per-device Counts / สรุปเครื่องนี้

| Section | PASS | FAIL | BLOCKED | N/A |
|---|---|---|---|---|
| A (7 items) | | | | |
| B (3 items) | | | | |
| C (10 items) | | | | |
| D (7 items) | | | | |
| **Total**   | | | | |

#### Per-device Verdict / ผลเครื่องนี้

- [ ] **READY** — 0 S1, ≤ 2 S2 พร้อม workaround, perf ผ่านเกณฑ์
- [ ] **NOT READY** — list S1/S2 ด้านล่าง

**Sign-off (initials):** _____  **Date (Asia/Bangkok):** YYYY-MM-DD HH:mm

---

## 3. Issue Block Template / เทมเพลตรายงาน issue

ใช้ block นี้ต่อ 1 issue (ทั้ง S1, S2). Paste ลงใน `PHASE_1C_PILOT_RESULTS.md` § 9 ด้วย.

```
Device ID: D__
Test ID: <A1, C4, etc.>
Severity: S1 / S2 / S3 / S4
Summary: <one line>
Steps:
  1.
  2.
  3.
Expected:
Actual:
Network: Wi-Fi / 4G / 5G
Reproducible? ☐ Always ☐ Sometimes ☐ Once
Perf event id (uuid only, no PII):
Screenshot ref (filename only):
Workaround (if any):
```

---

## 4. Log / Screenshot Attachments / การแนบไฟล์

**Naming convention (บังคับ):**

```
phase1c_<deviceId>_<testId>_<initials>_<YYYYMMDD>.<png|jpg|txt|har>
```

ตัวอย่าง: `phase1c_D2_C4_AA_20260429.png`

**Storage location:** _(internal Drive / Notion / shared folder — ระบุที่นี่)_  __________________________

| # | Filename | Linked test ID | Device | Tester | Type |
|---|---|---|---|---|---|
| 1 | | | | | ☐ Screenshot ☐ Log ☐ HAR ☐ Video |
| 2 | | | | | |
| 3 | | | | | |

> **ห้ามแนบ:** raw token, `line_user_id` เต็ม, ภาพหน้าผู้ใช้แบบเห็นหน้าชัด, GPS lat/lng จริง, photo URL ที่เปิดได้สาธารณะ, stack trace ที่มี user identifier

---

## 5. Aggregate Roll-up Note / สรุปกลับไป results

หลังกรอกครบทุก device:

1. รวม PASS/FAIL/BLOCKED ทุกเครื่อง → ใส่ใน `PHASE_1C_PILOT_RESULTS.md` § 8
2. รวม perf p50/p95 (จาก `/attendance/portal-performance` ตอนปิด pilot) → § 11
3. Copy issue blocks ทั้งหมด → § 9
4. ตรวจ Pass/Fail Gates ใน `PHASE_1C_PILOT_RESULTS.md` § 12 → ถ้ามีข้อ ❌ ใด → trigger §4 ของ `PHASE_1C_ROLLBACK_SAFE_CHECKLIST.md`
5. Sign-off ใน § 13 ของ `PHASE_1C_PILOT_RESULTS.md`
