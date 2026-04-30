## Goal / เป้าหมาย

เพิ่มเอกสาร 2 ไฟล์ใน `docs/` เพื่อให้คุณ (1) เช็กความปลอดภัยก่อน/หลัง deploy ว่าไม่มีใครไปแตะ logic core และ (2) จับผลทดสอบ Pilot QA ต่ออุปกรณ์จริง iOS/Android ได้อย่างเป็นระบบ พร้อม PASS/FAIL, network type, p50/p95, และที่แนบ log/screenshot

**Scope (สำคัญ):** ไม่แก้โค้ด, ไม่แก้ DB, ไม่แตะ edge functions, ไม่แตะ `// ⚠️ VERIFIED` files. เพิ่มเฉพาะไฟล์ Markdown ใหม่ 2 ไฟล์เท่านั้น เพื่อรักษานโยบาย Phase 1C "no refactor / no new features".

---

## Files to create / ไฟล์ที่จะสร้าง

### 1) `docs/PHASE_1C_ROLLBACK_SAFE_CHECKLIST.md` (ใหม่)

Checklist ที่คุณเดินตามข้อต่อข้อ ก่อน deploy และหลัง deploy เพื่อยืนยันว่า "ไม่มีอะไรไปแตะ core" ครอบคลุม:

- **Pre-deploy gates / ก่อน deploy**
  - Build เขียวบน CI (`npm run build`)
  - `npm run smoke:quick` = 16/16 pass
  - `npm run audit:consistency` exit 0 (route ↔ registry ↔ portal-actions ↔ DB เข้ากันหมด)
  - `git diff` ไม่แตะรายชื่อ "do-not-touch" (line-webhook, attendance-submit, attendance-validate-token, claim_attendance_token, Bangkok timezone helpers, payroll math, point ledger, Employee Documents)
  - ไฟล์ที่ติด `// ⚠️ VERIFIED — DO NOT REFACTOR` 5 ไฟล์ ไม่มี diff ในส่วน data fetch / role gating / layout grid (อนุญาตเฉพาะ additive UI)
  - `supabase/config.toml` ไม่มีการเปลี่ยน project-level settings
  - ไม่มี migration ใหม่ที่แตะ schema `auth/storage/realtime/supabase_functions/vault`
  - ไม่มีการเพิ่ม CHECK constraint ที่ใช้ `now()` (ต้องใช้ trigger แทน)
  - ENV/Secrets ครบ (CRON_SECRET, LINE_CHANNEL_SECRET, ฯลฯ) — ตรวจด้วยรายชื่อ ไม่ echo ค่า
  - Performance dashboard `/attendance/portal-performance` เปิดได้ และมี events ไหลเข้า (baseline ก่อน deploy)

- **Deploy window / ช่วง deploy**
  - แจ้งผู้ทดสอบล่วงหน้า, จดเวลา (Asia/Bangkok), จด commit hash
  - กดเฝ้า edge function logs: `line-webhook`, `attendance-submit`, `attendance-validate-token`
  - Tail `portal_performance_events` ดู spike ของ `token_validate_failed` / `checkin_submit_failed`

- **Post-deploy smoke (≤10 นาทีแรก)**
  - เช็คอิน 1 ครั้งจริง (1 admin, 1 employee) — รอบสมบูรณ์ check-in + check-out
  - เปิด `/attendance/ops-center` ด้วย role: owner/admin/hr/manager → เข้าได้ทั้งหมด
  - ลอง role: employee/field/user → เข้าไม่ได้ทั้ง nav และ direct URL (role gating ไม่รั่ว)
  - p95 `portal_ready` หลัง deploy ≤ baseline + 20%
  - ไม่มี duplicate row ใน `attendance_logs` ช่วง 10 นาที
  - LIFF init สำเร็จในเครื่องจริง iOS และ Android อย่างละ 1 เครื่อง
  - Cron jobs (`task-scheduler`, `attendance-snapshot-update`) ยัง 200 OK ด้วย CRON_SECRET ที่ถูกต้อง

- **Rollback triggers / เมื่อไหร่ต้อง rollback**
  - S1 blocker ใด ๆ จาก `PHASE_1C_PILOT_QA.md`
  - `checkin_submit_failed` rate > 3% ใน 30 นาที
  - `token_validate_failed` (ไม่นับ expired/not_found) > 1%
  - duplicate attendance row เกิดขึ้นแม้ครั้งเดียว
  - role leak (employee เห็นหน้า admin)
  - LIFF blank/white screen ที่ reproduce ได้

- **Rollback procedure (ขั้นตอนกลับ)**
  - ใช้ Lovable History → กดย้อนกลับ version ก่อน deploy (ไม่ต้อง revert ด้วย code)
  - แสดง `<lov-open-history>View History</lov-open-history>` action เพื่อให้คุณกดได้ทันที
  - ตรวจซ้ำว่า edge functions revert พร้อมกัน (Lovable Cloud จะ deploy auto)
  - บันทึกเหตุผลใน `PHASE_1C_PILOT_RESULTS.md` ส่วน Blocker List

- **Sign-off block** (Pilot lead + Reviewer initials + verdict)

### 2) `docs/PHASE_1C_DEVICE_QA_FORM.md` (ใหม่)

แบบฟอร์มจับผลต่อ "1 อุปกรณ์ = 1 form block" ให้คุณ copy-paste ได้เรื่อย ๆ คู่กับ `PHASE_1C_PILOT_RESULTS.md` (ซึ่งเป็น aggregate). โครงสร้าง:

- **Header per device:** ผู้ทดสอบ (initials), role, รุ่นเครื่อง, OS+version, LINE version, network (Wi-Fi/4G/5G), DPR, สาขา, วัน-เวลา (Asia/Bangkok), commit hash
- **Section A — LIFF / Portal cold start (7 ข้อจาก A1–A7):** ช่อง PASS / FAIL / BLOCKED + load time (ms) + severity S1–S4 + notes
- **Section B — Outside-LINE fallback (B1–B3)**
- **Section C — Check-in token flow (C1–C10):** รวมช่อง "เครือข่ายขณะทดสอบ" และ "เวลา submit (ms)"
- **Section D — Manager/Admin Ops Center (D1–D7)**
- **Performance capture (per device):** ช่องจด p50/p95 ของ `portal_ready`, `liff_init_done`, `token_validate_success`, `checkin_submit_success` พร้อม window (24h/7d) — ดึงจาก `/attendance/portal-performance`
- **Log attachments table:** ชื่อไฟล์ตามรูปแบบ `phase1c_<deviceId>_<area><id>_<YYYYMMDD>.png|txt`, perf event id (uuid only), แหล่งเก็บ (Drive/Notion link)
- **PII rule banner ด้านบน:** ห้ามแนบ token, line_user_id, raw GPS, photo URL, ชื่อจริงเต็ม
- **Per-device verdict:** READY / NOT READY + sign-off initials
- **Aggregate roll-up note:** ลิงก์กลับไปกรอกสรุปใน `PHASE_1C_PILOT_RESULTS.md` ส่วน 8 (PASS/PARTIAL/FAIL counts) และส่วน 11 (Performance Snapshot)

ทั้งสองไฟล์เป็น Bilingual TH/EN ตามมาตรฐานโปรเจกต์ และอ้างอิงไฟล์ที่มีอยู่แล้ว (`PHASE_1C_PILOT_QA.md`, `PHASE_1C_PERF_QUERIES.md`, `PHASE_1C_PILOT_RESULTS.md`) เพื่อไม่ให้ข้อมูลซ้ำซ้อน

---

## Files NOT touched / ไฟล์ที่จะไม่แตะ

- ไม่มีการแก้ `src/**`, `supabase/functions/**`, migrations, `supabase/config.toml`
- ไม่แตะไฟล์ที่ติด `// ⚠️ VERIFIED` (PortalHome, CheckInOut, OpsCenter, PortalPerformance, PortalLayout)
- ไม่แก้ `package.json`, `scripts/consistency-audit.mjs`, `scripts/smoke-test.mjs`
- ไม่แก้ `.lovable/registry-snapshot.json`

## Verification after creation

- เปิดทั้ง 2 ไฟล์เพื่อยืนยันว่า render ถูกใน Markdown
- รัน `npm run smoke:quick` (คาดหวัง 16/16 pass — เพราะไม่ได้แตะโค้ด)
- รัน `npm run audit:consistency` (คาดหวัง exit 0)

## Deliverable / สิ่งที่คุณจะได้

1. `docs/PHASE_1C_ROLLBACK_SAFE_CHECKLIST.md` — checklist ก่อน/หลัง deploy + rollback triggers + procedure
2. `docs/PHASE_1C_DEVICE_QA_FORM.md` — ฟอร์มต่ออุปกรณ์จริง พร้อมช่อง p50/p95, network, log attachments
3. ผลรัน smoke + consistency audit ยืนยันว่าไม่มี regression
