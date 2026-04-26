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

## 7. Deposit/Reimbursement Detection

| ส่วน | ไฟล์ | สิ่งที่ต้อง sync |
|------|------|------------------|
| Settings UI | `src/pages/attendance/DepositSettings.tsx` | company_accounts, enable toggles |
| Database | `deposit_settings` table | company_accounts, enable_deposit_detection, enable_reimbursement_detection |
| LINE Handler | `supabase/functions/line-webhook/index.ts` | determineTransferType(), buildReimbursementFlex(), getDocumentTypeName() |
| Admin List | `src/pages/attendance/Deposits.tsx` | document_type display/filter |
| Portal Review | `src/pages/portal/DepositReview.tsx` | document_type display |

### Logic Flow

```
1. Image received → classifyDocumentType()
2. If deposit_slip → extractDepositDataFromImage() (with sender/recipient)
3. → determineTransferType() (compare recipient vs company_accounts)
4. → Check enable_deposit_detection / enable_reimbursement_detection
5. → Save with correct document_type
6. → Send appropriate Flex Message (buildDepositFlex or buildReimbursementFlex)
```

### เมื่อเพิ่ม document_type ใหม่

1. **อัพเดท getDocumentTypeName()** - เพิ่ม type name ใน Record
2. **อัพเดท Deposits.tsx** - เพิ่มใน filter และ getDocTypeLabel()
3. **อัพเดท DepositReview.tsx** - แสดง badge และ title ที่ถูกต้อง
4. **อัพเดท buildXxxFlex()** - สร้าง Flex Message ที่เหมาะสม

---

## 8. Portal Pages & portal-data Endpoints

| Portal Page | portal-data Endpoint | Status |
|-------------|---------------------|--------|
| PortalHome | home-summary | ✅ |
| CheckInOut | attendance-status | ✅ |
| MyWorkHistory | attendance-history | ✅ |
| MyPayroll | payroll | ✅ |
| MyLeaveBalance | leave-balance | ✅ |
| MySchedule | schedules | ✅ |
| MyProfile | profile | ✅ |
| RequestLeave | submit-leave | ✅ |
| RequestOT | submit-ot, ot-requests | ✅ |
| DepositUpload | - (uses deposit-submit) | ✅ |
| RewardShop | - (direct queries) | ⏳ |

### เมื่อเพิ่ม Portal Page ใหม่:
1. เพิ่ม endpoint ใน portal-data/index.ts
2. สร้าง page ใน src/pages/portal/
3. ใช้ portalApi() แทน supabase.from() (ถ้าต้องการ bypass RLS)
4. อัพเดท Help.tsx ถ้าเป็น user-facing feature
5. เพิ่ม route ใน App.tsx

---

## 9. Help.tsx Content Sync

| Component | สิ่งที่ต้อง sync |
|-----------|-----------------|
| quickActions | ต้องครอบคลุมทุก user-facing features |
| faqs | ต้องตอบคำถามเกี่ยวกับทุก features |

### เมื่อเพิ่ม Feature ใหม่ที่ User ใช้งาน:
1. เพิ่ม Quick Action ใน Help.tsx (ถ้ามี dedicated page)
2. เพิ่ม FAQ อธิบายวิธีใช้งาน
3. ทั้ง Thai และ English versions
4. ตรวจสอบ icon import

---

## ⚠️ คำเตือนสำหรับ AI

1. **อย่าแก้ไข functions ที่ทำงานดีอยู่แล้ว** โดยไม่จำเป็น
2. **ก่อนแก้ไขให้ตรวจสอบ** ว่าส่วนที่จะแก้มี dependencies กับส่วนอื่นหรือไม่
3. **ใช้ explicit relationship syntax** เมื่อ query tables ที่มี multiple foreign keys
4. **อัปเดต documentation** เมื่อเพิ่ม features ใหม่
5. **ทดสอบก่อน deploy** โดยเฉพาะเมื่อแก้ไข edge functions
6. **อัพเดท Help.tsx** เมื่อเพิ่ม Portal features ใหม่
7. **เพิ่ม command ใน 3 ที่** เมื่อเพิ่ม bot command: parser, handler, bot_commands table
8. **อ่าน `.lovable/CRITICAL_FILES.md`** ก่อนแก้ไฟล์ใน critical list
9. **เคารพ `// ⚠️ VERIFIED [DATE]` comments** — ห้ามแตะ block นั้น เว้นแต่ user สั่งตรงๆ

---

## 10. Supabase Query Patterns (กฎที่เคยพัง — ห้ามทำซ้ำ)

### ❌ ห้าม chain `.select()` หลัง `.eq()`

```ts
// ❌ TS error: FilterBuilder.select() ไม่รับ {count, head}
let q = supabase.from('x').select('id', { count: 'exact', head: true }).eq('a', 1);
q = q.eq('b', 2).select('id, joined:y!inner(z)', { count: 'exact', head: true });

// ✅ Decide select string upfront
const sel = needsJoin ? 'id, joined:y!inner(z)' : 'id';
let q = supabase.from('x').select(sel, { count: 'exact', head: true }).eq('a', 1);
if (needsJoin) q = q.eq('joined.z', val);
```

### ✅ Cast embed type สำหรับ 1-to-1 relationship

Generated types มอง embed เป็น array เสมอ → cast ตรงๆ + normalize:

```ts
const { data } = await supabase.from('employees')
  .select('id, employee_roles(role_key)').single();
const row = data as { id: string; employee_roles: { role_key: string } | { role_key: string }[] | null };
const roleObj = Array.isArray(row.employee_roles) ? row.employee_roles[0] : row.employee_roles;
```

### ✅ Multiple FK to same table → use `!fk_name` syntax

```ts
// employees มี 2 FK ไป branches: branch_id และ primary_branch_id
.select('*, branches:branches!branch_id(name)')  // ✅
.select('*, branches(name)')                      // ❌ ambiguous
```

---

## Last Updated
- 2026-04-26: Added Section 10 (Supabase Query Patterns) + AI guardrails referencing `.lovable/CRITICAL_FILES.md`
- 2026-01-11: Added Portal Pages sync (Section 8) and Help.tsx sync (Section 9), updated warnings
- 2026-01-08: Added Deposit/Reimbursement Detection section (Section 7)
- 2026-01-07: Initial version - Added Portal Access Mode 'both' support
