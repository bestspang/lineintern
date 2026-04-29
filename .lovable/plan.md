
## Root Cause ที่เพิ่งเจอ

`supabase/config.toml` มีแค่บรรทัดเดียว (`project_id`) — **ไม่มี config block สำหรับ `line-webhook`** → Supabase ใช้ default `verify_jwt = true` → LINE ยิง webhook มาโดยไม่มี Authorization header → ถูก gateway reject ด้วย **401 Unauthorized** ก่อน code ของเราจะรันด้วยซ้ำ

นี่คือสาเหตุที่:
- LINE Console verify ใหม่ → fail (URL ใหม่)
- URL เก่า (`bjzzqfzgnslefqhnsmla`) ผ่านได้ → เพราะ project นั้นตั้ง `verify_jwt = false` ไว้แล้ว
- Project ปัจจุบัน "headless" มาตลอด → ต่อให้ webhook ชี้มา ข้อมูลก็เข้าไม่ได้

## Part 1: แก้ Webhook ให้ Verify ผ่าน (Critical, ก่อน Part B)

### 1.1 อัพเดท `supabase/config.toml`
เพิ่ม block:
```toml
project_id = "phhxdgaiwgaiuecvfjgj"

[functions.line-webhook]
verify_jwt = false

[functions.attendance-submit]
verify_jwt = false

[functions.attendance-validate-token]
verify_jwt = false

[functions.employee-menu-validate]
verify_jwt = false
```
(เพิ่ม `verify_jwt = false` ให้ทุก endpoint ที่ public-facing รับ external traffic — LINE webhook + attendance form + LIFF)

### 1.2 ตรวจ signature handler ใน `line-webhook/index.ts`
- LINE verify ส่ง POST body `{"events":[],"destination":"..."}` พร้อม header `x-line-signature`
- Code ต้อง return **HTTP 200** ภายใน 1 วิ ไม่ว่า signature จะตรงหรือไม่ (LINE verify จะ reject ถ้าได้ status อื่น)
- ผมจะอ่าน signature/body validation block แล้วยืนยันว่า empty events array ไม่ทำให้ throw

### 1.3 ขั้นตอนหลัง deploy
1. รอ ~1 นาที ให้ config redeploy
2. คุณกด **Verify** ใน LINE Console อีกครั้ง → ต้องเป็น "Success"
3. กด **"Verify Now"** ใน app (Settings → Integrations) → ต้องเขียวทุก field
4. ส่งข้อความทดสอบใน LINE → เช็คใน DB ว่ามี row ใหม่ใน `messages` table

## Part 2: Data Recovery (Part B จาก plan เดิม)

หลัง Part 1 ผ่านแล้ว → เริ่มดึงข้อมูล 5/3 → ปัจจุบัน จาก `bjzzqfzgnslefqhnsmla`

ขอเลือก 1 ใน 2:
- **(A) แนะนำ**: คุณส่ง **service_role key** ของ project เก่าให้ผ่าน `add_secret` (ชื่อ `OLD_PROJECT_SERVICE_KEY`) → ผมสร้าง edge function `migrate-old-project-data`:
  - Dry-run ก่อน → แสดงจำนวน row ต่อ table จะ insert
  - Tables: `messages`, `attendance_logs`, `attendance_tokens`, `point_transactions`, `happy_points`, `users`, `groups`
  - Conflict strategy: skip ถ้า unique key (`line_message_id`, `(employee_id, server_time)`, `line_user_id`) ซ้ำ
  - หลัง confirm → insert จริง + recompute streak/summary
  - ลบ secret ทิ้งหลังเสร็จ
- **(B)**: คุณ export CSV จาก dashboard project เก่าเอง แล้ว upload → ผม import

### หา service_role key ของ project เก่า
1. ไป https://supabase.com/dashboard/project/bjzzqfzgnslefqhnsmla/settings/api
2. ส่วน "Project API keys" → copy `service_role` (ลับ ห้ามเผยแพร่)
3. ส่งให้ผมผ่าน secret prompt ที่ผมจะเปิดให้

## Files to Edit/Create

```text
EDIT supabase/config.toml                                  (Part 1.1 — critical fix)
NEW  supabase/functions/migrate-old-project-data/index.ts  (Part 2, after key)
```

## Regression Safety
- ไม่แตะ `line-webhook/index.ts` (// ⚠️ VERIFIED) — แค่ตรวจอ่าน
- `verify_jwt = false` คือสิ่งที่ webhook สาธารณะ **ต้องมี** อยู่แล้ว — เป็นการ restore default ที่ถูกต้อง ไม่ใช่การลด security (signature validation ทำใน code ด้วย LINE_CHANNEL_SECRET อยู่แล้ว)
- `attendance-submit`, `attendance-validate-token`, `employee-menu-validate` — public endpoints ที่ user ไม่ login ใช้ token ของตัวเอง → ต้อง `verify_jwt = false` เช่นกัน

## คำถามเพื่อ approve

1. **Part 1**: approve แก้ `config.toml` เลยไหม?
2. **Part 2**: เลือก **(A)** ส่ง service_role key หรือ **(B)** export CSV เอง?
