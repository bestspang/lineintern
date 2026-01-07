# System Sync Checklist

เอกสารนี้ใช้สำหรับ track การ sync ระหว่างส่วนต่างๆ ของระบบ เพื่อป้องกันปัญหาที่เกิดจากการแก้ไขไม่ครบถ้วน

---

## 1. Portal Access Mode

| ส่วน | ไฟล์ | สิ่งที่ต้อง sync |
|------|------|------------------|
| Frontend Settings | `src/pages/Settings.tsx` | RadioGroup options (liff, token, both) |
| Database | `system_settings.portal_access_mode` | `available_modes` array |
| Backend - Menu | `supabase/functions/line-webhook/index.ts` (line ~8870) | accessMode condition |
| Backend - Checkin/Checkout | `supabase/functions/attendance-submit/index.ts` | Token validation logic |

### Mode Behavior:
- **liff**: /menu, checkin, checkout ทั้งหมดใช้ LIFF URL
- **token**: /menu, checkin, checkout ทั้งหมดใช้ Token Link
- **both**: /menu ใช้ LIFF, checkin/checkout ใช้ Token Link

---

## 2. Bot Commands

| ส่วน | ไฟล์ | สิ่งที่ต้อง sync |
|------|------|------------------|
| Parser | `supabase/functions/line-webhook/utils/command-parser.ts` | `commandMap` + `ParsedCommand` type |
| Handler | `supabase/functions/line-webhook/index.ts` (line ~9007) | switch case handler |
| Database | `bot_commands` table | `command_key`, `category`, descriptions |
| Aliases | `command_aliases` table | `alias_text` entries |
| Help Display | `categoryInfo` object in line-webhook | category metadata |

### เมื่อเพิ่ม Command ใหม่:
1. เพิ่ม command ใน `command-parser.ts` → `commandMap`
2. เพิ่ม handler ใน `index.ts` → switch case
3. เพิ่ม record ใน `bot_commands` table
4. (Optional) เพิ่ม aliases ใน `command_aliases` table

---

## 3. Attendance System

| ส่วน | ไฟล์ | สิ่งที่ต้อง sync |
|------|------|------------------|
| Settings UI | `src/pages/attendance/Settings.tsx` | Form fields |
| Database | `attendance_settings` table | Columns |
| Token Generation | `supabase/functions/line-webhook/index.ts` | Token format |
| Token Validation | `supabase/functions/attendance-validate-token/index.ts` | Token validation |
| Submit Logic | `supabase/functions/attendance-submit/index.ts` | Submit handling |

---

## 4. Employee Data

| ส่วน | ไฟล์ | สิ่งที่ต้อง sync |
|------|------|------------------|
| Employee List | `src/pages/attendance/Employees.tsx` | Query fields |
| Payroll | `src/pages/attendance/Payroll.tsx` | Query fields (use `branches!branch_id` for joins) |
| Portal Profile | `src/pages/portal/MyProfile.tsx` | Display fields |

### หมายเหตุสำคัญ:
- `employees` table มี 2 foreign keys ไปที่ `branches`: `branch_id` และ `primary_branch_id`
- เมื่อ query ต้องใช้ syntax: `branches:branches!branch_id(name)` เพื่อระบุ relationship ที่ชัดเจน

---

## 5. Receipt System

| ส่วน | ไฟล์ | สิ่งที่ต้อง sync |
|------|------|------------------|
| Settings | `src/pages/receipts/ReceiptSettings.tsx` | Form fields |
| Database | `receipt_settings` table | Columns |
| Bot Handler | `supabase/functions/line-webhook/handlers/receipt-handler.ts` | Processing logic |
| Submit Function | `supabase/functions/receipt-submit/index.ts` | Submit handling |

---

## 6. Deposit System

| ส่วน | ไฟล์ | สิ่งที่ต้อง sync |
|------|------|------------------|
| Settings | `src/pages/attendance/DepositSettings.tsx` | Form fields |
| Database | `deposit_settings` table | Columns |
| Submit Function | `supabase/functions/deposit-submit/index.ts` | Submit handling |
| Reminder | `supabase/functions/deposit-reminder/index.ts` | Reminder logic |

---

## ⚠️ คำเตือนสำหรับ AI

1. **อย่าแก้ไข functions ที่ทำงานดีอยู่แล้ว** โดยไม่จำเป็น
2. **ก่อนแก้ไขให้ตรวจสอบ** ว่าส่วนที่จะแก้มี dependencies กับส่วนอื่นหรือไม่
3. **ใช้ explicit relationship syntax** เมื่อ query tables ที่มี multiple foreign keys
4. **อัปเดต documentation** เมื่อเพิ่ม features ใหม่
5. **ทดสอบก่อน deploy** โดยเฉพาะเมื่อแก้ไข edge functions

---

## Last Updated
- 2026-01-07: Initial version - Added Portal Access Mode 'both' support
