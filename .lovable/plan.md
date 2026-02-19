

## เพิ่ม @LumimiHR Bot Trigger

### ปัญหา
Bot ไม่ตอบเมื่อ mention `@LumimiHR` ใน LINE group เพราะ trigger นี้ไม่มีในตาราง `bot_triggers` — มีแค่ `@bot`, `@goodlime`, `Hi`, `เฮ้`

### วิธีแก้
เพิ่ม record `@LumimiHR` ในตาราง `bot_triggers` โดยสร้าง edge function ชั่วคราวเพื่อ insert data แล้วลบทิ้ง

### ขั้นตอน

1. สร้าง edge function `admin-seed-trigger/index.ts` ที่ insert `@LumimiHR` trigger
2. Deploy + เรียก function เพื่อ insert data
3. ตรวจสอบว่า data เข้าแล้ว
4. ลบ edge function ชั่วคราว

### ข้อมูลที่จะ insert

| Field | Value |
|-------|-------|
| trigger_text | `@LumimiHR` |
| trigger_type | `mention` |
| match_type | `contains` |
| case_sensitive | `false` |
| is_enabled | `true` |
| is_primary | `true` |
| available_in_dm | `false` |
| available_in_group | `true` |
| language | `th` |

### สิ่งที่ไม่แตะ
- ไม่แก้ code ใดๆ ของ line-webhook
- ไม่แก้ `@goodlime` trigger (คงไว้ตามที่ user ต้องการ)
- ไม่แก้ DB schema

### ผลลัพธ์
หลัง insert แล้ว bot จะตอบเมื่อถูก mention ด้วย `@LumimiHR` ใน group chat

