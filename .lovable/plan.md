## ปัญหา (Confirmed)
- LINE webhook URL ปัจจุบัน: `https://bjzzqfzgnslefqhnsmla.supabase.co/...` (project เก่า)
- Project ที่ active อยู่: `phhxdgaiwgaiuecvfjgj` (ที่ Lovable connect)
- ผลกระทบ: ตั้งแต่ 5/3 ข้อมูล LINE ทุกตัว (messages, attendance_logs, tokens, points) ไหลเข้า project เก่า → DB ปัจจุบันว่างเปล่า

## เป้าหมาย
1. สร้างระบบตรวจ + ยืนยัน webhook URL (manual one-click + cron daily + health endpoint)
2. ดึงข้อมูลที่ค้างใน project เก่า (5/3 → ปัจจุบัน) กลับมา merge

---

## Part A: Webhook Verification System

### A1. Edge Function ใหม่: `verify-line-webhook`
เรียก LINE Messaging API endpoint:
```
GET https://api.line.me/v2/bot/channel/webhook/endpoint
Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}
```
- เปรียบเทียบ `endpoint` ที่ได้กับ expected URL: `https://phhxdgaiwgaiuecvfjgj.supabase.co/functions/v1/line-webhook`
- ถ้าไม่ตรง → log alert + return `{ ok: false, current, expected, mismatch: true }`
- ถ้าตรง → ยิง `POST /v2/bot/channel/webhook/test` เพื่อ verify จริงว่า LINE call ผ่าน → return `{ ok: true, success: true, statusCode, reason }`
- บันทึกผลลง table ใหม่ `webhook_verification_logs` (id, checked_at, current_url, expected_url, is_match, test_success, test_status_code, raw_response)

### A2. Migration: `webhook_verification_logs`
Additive only. RLS: admin/owner read.

### A3. UI: ปุ่ม "ตรวจ Webhook" ใน `Integrations.tsx` (มีอยู่แล้ว)
- เพิ่ม Card "LINE Webhook Verification"
- ปุ่ม "ตรวจสด" → invoke `verify-line-webhook` → แสดงผล badge เขียว/แดง + URL ปัจจุบัน + URL ที่ควรเป็น + last test result
- แสดง history 10 รายการล่าสุดจาก `webhook_verification_logs`
- ถ้า mismatch แสดงคำแนะนำ + deep link ไปหน้า LINE Developers Console

### A4. Cron daily verification
ตั้ง pg_cron รัน `verify-line-webhook` ทุกวัน 09:00 Bangkok time
- ถ้า mismatch หรือ test fail → push LINE alert ไป admin group (ใช้ pattern ที่มีอยู่ใน `line-webhook-error-routing` memory)

### A5. Health endpoint enhancement
อัพเดท `health` edge function ให้รวม:
- `webhook_url_match: bool`
- `last_webhook_verification: timestamp`
- `last_attendance_log_at`, `last_message_at` (เพื่อ detect stagnation)
แสดงใน `HealthMonitoring.tsx` page

---

## Part B: Data Recovery from Old Project

### B1. ต้องการจากผู้ใช้ก่อนเริ่ม
ผมเข้าถึง project `bjzzqfzgnslefqhnsmla` ไม่ได้โดยตรง (ไม่ใช่ Lovable Cloud ของ project นี้) — ต้องใช้ **service_role key** ของ project เก่า

ขอ 1 ใน 2:
- **(a)** ผู้ใช้แปะ service_role key ของ `bjzzqfzgnslefqhnsmla` ให้ ผมจะ store ชั่วคราวเป็น secret `OLD_PROJECT_SERVICE_KEY` แล้ว run script ดึง + merge + ลบ secret ทิ้งหลังเสร็จ
- **(b)** ผู้ใช้ export CSV จาก dashboard ของ project เก่า (tables: `messages`, `attendance_logs`, `attendance_tokens`, `point_transactions`, `happy_points`, `users`, `groups`) แล้ว upload ให้ ผม import เข้า project ปัจจุบัน

### B2. Migration script (one-shot edge function `migrate-old-project-data`)
- ดึงข้อมูลจาก 5/3 → now ของ tables ข้างต้นจาก project เก่า ผ่าน REST API (ใช้ service_role)
- Conflict strategy:
  - `messages`: insert ถ้า `line_message_id` ไม่ซ้ำ
  - `attendance_logs`: insert ถ้า (employee_id, server_time) ไม่ซ้ำ
  - `attendance_tokens`: skip (ไม่มีประโยชน์ย้อนหลัง)
  - `point_transactions`: insert + recompute `happy_points.point_balance` หลัง merge
  - `users`/`groups`: upsert ตาม `line_user_id`/`line_group_id`
- Dry-run mode ก่อน → แสดงจำนวน row จะ insert per table ให้ผู้ใช้ approve
- ลง audit log ทุกครั้ง

### B3. Post-migration verification
- เทียบ row count ก่อน/หลัง
- Recompute streaks (เรียก `point-streak-calculator` สำหรับช่วง 5/3 → now)
- Recompute attendance summaries (เรียก `attendance-snapshot-update` per missing date)

---

## Part C: Order of Execution
1. **Apply Part A ทั้งหมด** (verification system) — additive ปลอดภัย
2. **ผู้ใช้ใช้ปุ่ม "ตรวจสด" ครั้งแรก** เพื่อ confirm mismatch
3. **ผู้ใช้แก้ webhook URL ใน LINE Console** เป็น `https://phhxdgaiwgaiuecvfjgj.supabase.co/functions/v1/line-webhook` แล้วกด Verify
4. **กดตรวจสดอีกครั้ง** ใน app → ต้องเป็นเขียว
5. **ส่งข้อความทดสอบใน LINE** → confirm ข้อมูลใหม่เข้า DB ปัจจุบัน
6. **Part B** เริ่มหลังจาก step 5 ผ่าน (ขอ service_role key หรือ CSV)

---

## Files to Create/Edit

```text
NEW  supabase/functions/verify-line-webhook/index.ts
NEW  supabase/functions/migrate-old-project-data/index.ts   (Part B)
NEW  supabase/migrations/<ts>_webhook_verification_logs.sql
EDIT supabase/functions/health/index.ts                     (add webhook + stagnation fields)
EDIT src/pages/Integrations.tsx                             (add verification card)
EDIT src/pages/HealthMonitoring.tsx                         (show webhook + stagnation status)
NEW  pg_cron job: 'verify-line-webhook-daily' @ 09:00 ICT
```

## Regression Safety
- ไม่แตะ `line-webhook/index.ts` (// ⚠️ VERIFIED)
- ไม่แตะ attendance/timezone functions
- Additive only: table ใหม่, function ใหม่, UI section ใหม่
- Part B รันแบบ dry-run ก่อนทุกครั้ง

## คำถามเดียวที่ค้างก่อนผมเริ่ม build
สำหรับ **Part B** ขอเลือก: **(a) ส่ง service_role key ของ project เก่า** หรือ **(b) export CSV เอง**?

ถ้าตอบทีหลังก็ได้ — ผมจะเริ่ม Part A ก่อนได้เลยพอ approve plan นี้
