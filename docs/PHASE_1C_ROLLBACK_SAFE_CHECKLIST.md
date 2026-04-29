# Phase 1C — Rollback-Safe Checklist / เช็กลิสต์ก่อน-หลัง Deploy

> **Purpose / วัตถุประสงค์:** ใช้ก่อน/หลัง deploy ทุกครั้ง เพื่อยืนยันว่าไม่มีการแตะ logic core (line-webhook, attendance-submit/validate, claim_attendance_token, Bangkok timezone helpers, payroll math, point ledger, Employee Documents) และมีเส้นทาง rollback ที่ปลอดภัย
>
> **Companion docs:** [`PHASE_1C_PILOT_QA.md`](./PHASE_1C_PILOT_QA.md) · [`PHASE_1C_PILOT_RESULTS.md`](./PHASE_1C_PILOT_RESULTS.md) · [`PHASE_1C_PERF_QUERIES.md`](./PHASE_1C_PERF_QUERIES.md) · [`PHASE_1C_DEVICE_QA_FORM.md`](./PHASE_1C_DEVICE_QA_FORM.md)
>
> **Rule:** ถ้าข้อใดข้อหนึ่งใน Pre-deploy ไม่ผ่าน → **หยุด deploy**. ถ้าข้อใดใน Rollback Triggers เกิดขึ้นหลัง deploy → **กด rollback ทันที** ผ่าน Lovable History (ไม่เขียนโค้ดย้อน).

---

## 0. Deploy Metadata / ข้อมูลรอบ deploy

| Field | Value |
|---|---|
| Deploy date/time (Asia/Bangkok) | YYYY-MM-DD HH:mm |
| Commit hash | |
| Deployer (initials) | |
| Reviewer (initials) | |
| Pilot window start | |
| Pilot window end | |

---

## 1. Pre-Deploy Gates / ด่านก่อน deploy

### 1.1 Build & automated checks
- [ ] `npm run build` ผ่าน (no TS error)
- [ ] `npm run smoke:quick` = **16/16 PASS**
- [ ] `npm run audit:consistency` exit code **0** (route ↔ `.lovable/registry-snapshot.json` ↔ `portal-actions.ts` ↔ `webapp_page_config` ตรงกัน)
- [ ] `bun run test` (ถ้ามี vitest) — no failing test ที่เกี่ยวกับ portal/attendance

### 1.2 Do-NOT-touch diff guard / ห้ามแตะรายชื่อนี้
ตรวจ `git diff` แล้วยืนยันว่า **ไม่มี** การแก้ใน path เหล่านี้ (อนุญาตเฉพาะ comment-only หรือ log-only ที่ไม่กระทบ logic):

- [ ] `supabase/functions/line-webhook/**`
- [ ] `supabase/functions/attendance-submit/**`
- [ ] `supabase/functions/attendance-validate-token/**`
- [ ] `supabase/functions/_shared/timezone.ts`
- [ ] DB function `claim_attendance_token` (ไม่มี migration ใหม่ที่ DROP/ALTER)
- [ ] Payroll math: `point-attendance-calculator/**`, `point-streak-calculator/**`, `attendance-snapshot-update/**`
- [ ] Point ledger: ตาราง `point_transactions`, `employee_points` (ไม่มี migration ใหม่)
- [ ] Employee Documents: `src/components/employee-documents/**`, `src/pages/attendance/EmployeeDocuments.tsx`

### 1.3 VERIFIED files diff guard
ไฟล์ติด `// ⚠️ VERIFIED — DO NOT REFACTOR` 5 ไฟล์ — diff ต้องเป็น **additive UI เท่านั้น** (ห้ามแตะ data fetch / role gating / layout grid):

- [ ] `src/pages/portal/PortalHome.tsx`
- [ ] `src/pages/portal/CheckInOut.tsx`
- [ ] `src/pages/attendance/OpsCenter.tsx`
- [ ] `src/pages/attendance/PortalPerformance.tsx`
- [ ] `src/components/portal/PortalLayout.tsx`

### 1.4 Schema / config guard
- [ ] `supabase/config.toml` ไม่มีการเปลี่ยน project-level settings (เช่น `project_id`)
- [ ] ไม่มี migration ใหม่ที่แตะ schema reserved: `auth`, `storage`, `realtime`, `supabase_functions`, `vault`
- [ ] ไม่มี `CHECK` constraint ใหม่ที่ใช้ `now()` (ต้องใช้ trigger แทน)
- [ ] ทุก table ใหม่มี RLS policy

### 1.5 Secrets / ENV
ตรวจการมีอยู่ของ secret โดย **ไม่ echo ค่า** (ใช้ `test -n "$VAR"`):

- [ ] `LINE_CHANNEL_SECRET`
- [ ] `LINE_CHANNEL_ACCESS_TOKEN`
- [ ] `CRON_SECRET`
- [ ] `LOVABLE_API_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (edge runtime)

### 1.6 Baseline snapshot
ก่อน deploy เปิด `/attendance/portal-performance` แล้วบันทึก baseline:

| Metric | Baseline (pre-deploy) |
|---|---|
| `portal_ready` p95 (ms) | |
| `liff_init_done` p95 (ms) | |
| `token_validate_success` p95 (ms) | |
| `checkin_submit_failed` rate (%) | |
| Cron jobs ล่าสุด 200 OK? | ☐ Yes ☐ No |

> **Gate:** ทุก checkbox ในข้อ 1 ต้องติ๊ก ✅ ก่อนกด deploy

---

## 2. Deploy Window / ระหว่าง deploy

- [ ] แจ้งผู้ทดสอบล่วงหน้า (อย่างน้อย 15 นาที)
- [ ] เปิดหน้าต่าง edge function logs ค้างไว้: `line-webhook`, `attendance-submit`, `attendance-validate-token`
- [ ] เปิด `/attendance/portal-performance` ค้างไว้ดู spike
- [ ] บันทึกเวลาเริ่ม deploy (Asia/Bangkok): __________

---

## 3. Post-Deploy Smoke (≤10 นาทีแรก) / สโม้กหลัง deploy

ทำตามลำดับ ห้ามข้าม:

### 3.1 Cold path
- [ ] เปิด `/` (admin) → login สำเร็จ ไม่มี white screen
- [ ] เปิด `/p/home` ผ่าน LIFF จริง (iOS) → portal โหลดสำเร็จ
- [ ] เปิด `/p/home` ผ่าน LIFF จริง (Android) → portal โหลดสำเร็จ
- [ ] Skeleton แสดงทันที (< 300 ms)

### 3.2 Critical flow (ของจริง 1 รอบ)
- [ ] Employee เช็คอิน → log row ถูกบันทึก 1 row (ไม่มี duplicate)
- [ ] Employee เช็คเอาต์ → log row คู่ถูกบันทึก
- [ ] Confirmation message ไปถึง LINE DM + group

### 3.3 Role gating (ห้ามรั่ว)
- [ ] `owner` เปิด `/attendance/ops-center` ได้
- [ ] `admin` เปิด `/attendance/ops-center` ได้
- [ ] `hr` เปิด `/attendance/ops-center` ได้
- [ ] `manager` เปิด `/attendance/ops-center` ได้
- [ ] `employee` ลองเปิด direct URL → **ถูก redirect / block**
- [ ] `field` ลองเปิด direct URL → **ถูก redirect / block**
- [ ] `user` ลองเปิด direct URL → **ถูก redirect / block**
- [ ] Nav `/attendance/portal-performance` ซ่อนสำหรับ role ที่ไม่ใช่ owner/admin/hr/manager

### 3.4 Performance comparison
| Metric | Post-deploy | Baseline | Δ | Acceptable? (≤ +20%) |
|---|---|---|---|---|
| `portal_ready` p95 | | (จาก §1.6) | | ☐ |
| `liff_init_done` p95 | | | | ☐ |
| `checkin_submit_failed` rate | | | | ☐ |

### 3.5 Background jobs
- [ ] `task-scheduler` ถัดไปรัน 200 OK (auth ผ่าน, ไม่ใช่ "Unauthorized: Invalid or missing CRON_SECRET")
- [ ] `attendance-snapshot-update` ถัดไปรัน 200 OK
- [ ] `broadcast-scheduler` ถัดไปรัน 200 OK

---

## 4. Rollback Triggers / เกณฑ์กด rollback ทันที

ถ้า **ข้อใดข้อหนึ่ง** เกิดขึ้นในช่วง pilot window → **กด rollback ทันที**, ห้ามพยายาม hotfix ขณะ pilot:

| # | Trigger | วิธีตรวจ |
|---|---|---|
| R1 | S1 blocker จาก `PHASE_1C_PILOT_QA.md` | รายงานจากผู้ทดสอบ |
| R2 | `checkin_submit_failed` rate > **3%** ใน 30 นาทีล่าสุด | Perf query §3 ใน `PHASE_1C_PERF_QUERIES.md` |
| R3 | `token_validate_failed` (ไม่นับ `expired`/`not_found`) > **1%** | Perf query §2 |
| R4 | Duplicate row ใน `attendance_logs` แม้ครั้งเดียว | SQL: `SELECT employee_id, log_type, created_at::date, count(*) FROM attendance_logs WHERE created_at >= now() - interval '1 hour' GROUP BY 1,2,3 HAVING count(*) > 1;` |
| R5 | Role leak (employee/field/user เห็นหน้า admin) | จากการทดสอบ §3.3 |
| R6 | LIFF blank/white screen ที่ reproduce ได้บน iOS หรือ Android | รายงานจากผู้ทดสอบ + screenshot |
| R7 | `portal_ready` p95 พุ่ง > **2× baseline** เกิน 10 นาที | Dashboard real-time |
| R8 | Cron job fail ติดต่อกัน 2 รอบ (เช่น `Unauthorized` ของ CRON_SECRET) | Edge function logs |

---

## 5. Rollback Procedure / ขั้นตอนกลับเวอร์ชัน

> **กฎเหล็ก:** ห้ามเขียนโค้ด revert. ใช้ Lovable History เท่านั้น (frontend + edge functions revert พร้อมกันอัตโนมัติ).

1. **หยุดรับทดสอบ** — แจ้งผู้ทดสอบใน LINE group ว่า "Pause pilot ชั่วคราว"
2. **เปิด History tab** ใน Lovable → เลือก version ก่อน deploy นี้ → กด revert
3. **รอ Lovable Cloud redeploy edge functions** (อัตโนมัติ ~30–60 วินาที)
4. **Verify หลัง rollback:**
   - [ ] `npm run smoke:quick` 16/16 (ถ้ารันได้)
   - [ ] `/attendance/portal-performance` ยังเปิดได้
   - [ ] เช็คอินจริง 1 รอบ → สำเร็จ
   - [ ] Cron ถัดไป 200 OK
5. **บันทึกใน `PHASE_1C_PILOT_RESULTS.md` § Blocker List:** trigger ที่เจอ + เวลา (Asia/Bangkok) + commit ที่ revert ไป
6. **Post-mortem (ภายใน 24 ชม.):** root cause → ป้องกันไม่ให้ AI/คน ไปแตะจุดเดิมซ้ำ (เพิ่มไฟล์ลงรายชื่อใน §1.2 ถ้าจำเป็น)

```xml
<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>
```

---

## 6. Sign-off / การยืนยันผล

| Role | Initials | Date/Time (Asia/Bangkok) | Verdict |
|---|---|---|---|
| Pre-deploy gate (deployer)  | | | ☐ GO ☐ NO-GO |
| Pre-deploy gate (reviewer)  | | | ☐ GO ☐ NO-GO |
| Post-deploy smoke           | | | ☐ STABLE ☐ ROLLBACK |
| Pilot window close          | | | ☐ KEEP ☐ ROLLBACK |

**Final verdict:** ☐ DEPLOY KEPT  ☐ ROLLED BACK — reason: ______________________
