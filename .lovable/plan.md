## ปัญหา

Snapshot ตารางเข้างานค้างที่ 2026-03-05 มา ~55 วัน

**Root cause ที่ยืนยันแล้ว:**
- Cron jobs ทุกตัว (16 jobs) ยัง run สำเร็จทุก 5 นาที ✅
- `attendance-snapshot-update` run ปกติ ✅
- **แต่ไม่มี attendance_logs ใหม่ตั้งแต่ 2026-03-05 02:14 UTC เลย** ❌
- Active employees ยังมี 10 คน

→ Snapshot ไม่ได้พัง — **flow การ check-in ของพนักงานพัง** ทำให้ snapshot ไม่มี data ใหม่จะเขียน

## โมดูลที่เกี่ยวข้อง + สถานะ

| Module | Status | หมายเหตุ |
|---|---|---|
| `cron.job` ทั้งหมด | WORKING | run ครบทุก schedule |
| `attendance-snapshot-update` edge fn | WORKING | run สำเร็จ แค่ไม่มี data |
| `attendance_logs` insert path | **BROKEN** | ไม่มี row ใหม่ 55 วัน |
| `attendance-submit` edge fn | UNKNOWN | ต้องเช็ค logs |
| `attendance-validate-token` edge fn | UNKNOWN | ต้องเช็ค logs |
| `line-webhook` (trigger token) | UNKNOWN | ต้องเช็ค logs |
| LIFF / portal check-in UI | UNKNOWN | ต้องเทสจริง |
| RLS policies บน `attendance_logs` | UNKNOWN | อาจเปลี่ยนแล้ว block insert |

## สิ่งที่ต้อง preserve

- Cron jobs ทั้ง 16 ตัว (ห้ามแตะ schedule/command)
- `attendance-snapshot-update/index.ts` (verified, ทำงานถูก)
- Timezone helpers ใน `_shared/timezone.ts`
- `claim_attendance_token` RPC (verified)
- Validation logic ใน `attendance-submit/validation.ts`

## สิ่งที่อาจ broken จริง (ต้อง diagnose)

1. **Edge function errors** — เช็ค logs ของ `attendance-submit`, `attendance-validate-token`, `line-webhook` ย้อน 55 วัน หา error pattern
2. **Token lifecycle** — เช็ค `attendance_tokens` ว่ามี row ใหม่ไหม / status ส่วนใหญ่เป็นอะไร
3. **LINE webhook signature** — secret อาจเปลี่ยน, webhook URL ใน LINE Console อาจหลุด
4. **RLS regression** — migration ใหม่อาจ block insert
5. **LIFF endpoint URL** — APP_URL secret หรือ LIFF ID อาจเปลี่ยน

## แผน Diagnose (Phase 1 — read-only)

1. **Query DB หา signal:**
   - `SELECT MAX(created_at), COUNT(*) FROM attendance_tokens WHERE created_at > '2026-03-04'` → มี token ถูกสร้างไหมหลัง 5/3
   - ถ้ามี token → ปัญหาที่ submit/validate
   - ถ้าไม่มี token → ปัญหาที่ webhook/token-generator
2. **อ่าน edge function logs:**
   - `attendance-submit` ย้อน 7 วัน หา error
   - `attendance-validate-token` ย้อน 7 วัน
   - `line-webhook` หา request ที่มี text "checkin" / "เช็คอิน"
3. **เช็ค RLS ของ `attendance_logs` table** — มี policy ใหม่ที่ block insert จาก service role ไหม
4. **เช็ค secret `APP_URL` และ `LINE_CHANNEL_ACCESS_TOKEN`** ยัง valid

## แผน Fix (Phase 2 — หลังรู้ root cause)

จะแก้แบบ surgical ตาม root cause ที่หาเจอ — **ไม่ refactor cron/snapshot ที่ยังทำงานดีอยู่** ตัวเลือกตามสถานการณ์:

- **ถ้า edge fn error** → fix bug เฉพาะจุด, redeploy
- **ถ้า RLS block** → เพิ่ม policy ที่หายไป (additive)
- **ถ้า webhook secret หลุด** → reset secret ใน LINE Console + Lovable Cloud
- **ถ้า LIFF URL เปลี่ยน** → update APP_URL secret
- **ถ้าทีมหยุดใช้จริง** → ไม่ต้องแก้โค้ด, ยืนยันกับ user

## Smoke Test หลังแก้

1. Manual check-in ผ่าน LINE → ต้องได้ link
2. เปิด link → ต้องเห็นฟอร์มกล้อง+GPS
3. กดส่ง → row ใหม่ใน `attendance_logs` ภายใน 5 วินาที
4. รอ 5 นาที → `daily_attendance_summaries` วันนี้ต้อง update
5. รัน `scripts/smoke-test.mjs` ทั้งชุด

## Regression Checklist

- [ ] Cron jobs ทั้ง 16 ตัวยัง active
- [ ] `attendance-snapshot-update` ยัง run สำเร็จ
- [ ] ไม่มีการเปลี่ยน schema ของ `attendance_logs` / `daily_attendance_summaries`
- [ ] Timezone ยังเป็น Asia/Bangkok ทุกจุด
- [ ] Verified-comment functions ไม่ถูกแตะ

## คำถามก่อนเริ่ม Phase 2

ถ้าหลัง diagnose พบว่า:
- **(ก)** เป็น bug จริง (edge fn / RLS / secret) → ผมจะแก้ minimal diff แล้วเทส
- **(ข)** ทีมหยุดใช้งานจริง (ไม่มี bug) → จะยืนยันกับคุณก่อน ไม่แก้โค้ด
