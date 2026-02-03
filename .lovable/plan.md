

## รายงานการตรวจสอบความ Sync ของระบบ LINE Intern

### 1. สรุปผลการตรวจสอบ

| หมวด | สถานะ | รายละเอียด |
|------|-------|-----------|
| Portal Routes vs Help.tsx | ✅ Synced | Quick Actions 20 รายการ ถูกต้องทั้งหมด |
| Database FAQs | ✅ Synced | 33 FAQs active ใน portal_faqs |
| Bot Commands | ⚠️ ต้องอัพเดท | มี 3 รายการที่ไม่ตรง |
| Static FAQs | ⚠️ ต้องอัพเดท | ข้อมูลไม่ครบถ้วน |

---

### 2. ปัญหาที่พบ (Verified Issues)

#### 2.1 Static FAQs ใน Help.tsx ไม่ครบถ้วน

**ไฟล์:** `src/pages/portal/Help.tsx` บรรทัด 20-38

**ปัญหา:** Static FAQs มีเพียง 7 รายการ แต่ Database มี 33+ รายการ

**ผลกระทบ:** หาก Database ไม่สามารถเข้าถึงได้ User จะเห็น FAQs น้อยกว่าปกติมาก

**การแก้ไข:** เพิ่ม static FAQs สำรองให้ครอบคลุม categories หลัก:
- Attendance: เพิ่ม 2 รายการ (ขอกลับก่อน, Location-based check-in)
- Points: เพิ่ม 3 รายการ (Streak, Streak Shield, Leaderboard)
- Leave-OT: เพิ่ม 2 รายการ (ประเภทการลา, การอนุมัติ OT)

#### 2.2 Bot Command /status ไม่อยู่ใน Database

**ไฟล์:** `supabase/functions/line-webhook/index.ts` บรรทัด 5591-5739

**ปัญหา:** Function `handleStatusCommand` ทำงานได้ แต่ไม่มีใน `bot_commands` table

**ผลกระทบ:** User ไม่เห็น /status ในรายการ /help

**การแก้ไข:** เพิ่ม record ใน bot_commands:
```sql
INSERT INTO bot_commands (command_key, category, description_th, description_en, ...)
VALUES ('status', 'general', 'ดูสถานะ AI และหน่วยความจำ', 'View AI status and memory', ...);
```

#### 2.3 FAQ ระบุผิดว่า /cancel-ot ใช้ได้ใน "LINE Chat กับบอท"

**ไฟล์:** `src/pages/portal/Help.tsx` บรรทัด 25-26

**ปัญหา:** คำตอบระบุว่า "พิมพ์ /cancel-ot ใน LINE Chat กับบอท" แต่ไม่ชี้แจงว่าต้องเป็น DM (Direct Message) เท่านั้น

**ผลกระทบ:** User อาจพิมพ์ในกลุ่ม แล้วไม่ทำงาน

**การแก้ไข:** ปรับ FAQ answer เป็น:
```
"ไปที่ Portal > ประวัติการทำงาน กดปุ่ม 'ยกเลิก' หรือพิมพ์ /cancel-ot ใน DM (แชทส่วนตัว) กับบอท"
```

---

### 3. สิ่งที่ Verify แล้วว่าถูกต้อง (ไม่ต้องแก้)

| Feature | Location | Status |
|---------|----------|--------|
| exclude_from_points FAQ | portal_faqs | ✅ มี "ทำไมฉันถึงไม่ต้อง Track เวลาหรือแต้ม?" |
| Streak Shield FAQ | portal_faqs | ✅ มี "Streak Shield คืออะไร?" |
| /cancel-ot command | line-webhook | ✅ ทำงานได้ใน DM |
| /cancel-dayoff command | line-webhook | ✅ ทำงานได้ใน DM |
| Quick Actions paths | App.tsx | ✅ ทุก path valid |
| MyPoints UI | MyPoints.tsx | ✅ แสดง Streak Shield card |

---

### 4. Feature Suggestions (วิเคราะห์แล้วว่าปลอดภัย)

#### 4.1 เพิ่ม /points command (DM only)

**เหตุผล:** User สามารถเช็คแต้มผ่าน Portal ได้ แต่ไม่มีทาง quick-check ผ่าน LINE Bot

**ผลกระทบต่อระบบเดิม:** ไม่มี - เป็น read-only command

**Implementation:**
```typescript
// ใน line-webhook/index.ts
async function handlePointsCommand(lineUserId: string, locale: 'th' | 'en') {
  const employee = await getEmployeeByLineId(lineUserId);
  const points = await getEmployeePoints(employee.id);
  return formatPointsSummary(points, locale);
}
```

#### 4.2 เพิ่ม /schedule command (DM only)

**เหตุผล:** User ต้องเข้า Portal เพื่อดูตารางกะ แต่ควรมีทาง quick-check

**ผลกระทบต่อระบบเดิม:** ไม่มี - เป็น read-only command

#### 4.3 ปรับปรุง /help ให้แสดง command ตาม role

**สถานะปัจจุบัน:** /help แสดง commands ทุกตัวโดยไม่ filter

**ปัญหา:** User ธรรมดาเห็น command ที่ใช้ไม่ได้ (admin commands)

**การแก้ไขที่ปลอดภัย:** ใช้ `min_role_priority` ที่มีอยู่แล้วใน bot_commands table

---

### 5. ไฟล์ที่ต้องแก้ไข

| ลำดับ | ไฟล์ | การแก้ไข | Risk Level |
|-------|------|---------|------------|
| 1 | `src/pages/portal/Help.tsx` | อัพเดท STATIC_FAQS | ต่ำ |
| 2 | `portal_faqs` table | แก้ไข FAQ wording | ต่ำ |
| 3 | `bot_commands` table | เพิ่ม /status command | ต่ำ |

---

### 6. Code Changes แนะนำ

#### 6.1 อัพเดท Static FAQs (Help.tsx บรรทัด 20-38)

```typescript
const STATIC_FAQS_TH = [
  // Existing 7 items...
  { question: 'ฉันจะเช็คอินได้อย่างไร?', answer: '...' },
  // ... existing items ...
  
  // ADD: Points-related
  { question: 'Streak คืออะไร?', answer: 'Streak คือจำนวนวันที่คุณมาตรงเวลาติดต่อกัน เมื่อครบ 5 วันจะได้โบนัส 50 แต้ม และครบเดือนจะได้ 100 แต้ม' },
  { question: 'Streak Shield คืออะไร?', answer: 'โล่ป้องกัน Streak จะใช้อัตโนมัติเมื่อคุณมาสายหรือขาดงาน ช่วยให้ Streak ไม่หายไป' },
  
  // ADD: Attendance-related
  { question: 'ฉันจะขอกลับก่อนได้อย่างไร?', answer: 'เมื่อเช็คเอาต์ก่อนครบเวลา ระบบจะให้เลือกเหตุผล แล้วส่งคำขอไปหัวหน้าอนุมัติ' },
];
```

#### 6.2 Database Migration สำหรับ /status command

```sql
INSERT INTO bot_commands (
  command_key, 
  display_name_th, display_name_en,
  description_th, description_en,
  category, display_order, 
  icon_name, is_enabled,
  available_in_dm, available_in_group,
  min_role_priority, require_mention_in_group
) VALUES (
  'status',
  'สถานะ AI', 'AI Status',
  'ดูสถานะบุคลิกภาพและหน่วยความจำของ AI', 'View AI personality and memory status',
  'general', 3,
  'Activity', true,
  true, true,
  0, false
);

-- Add alias
INSERT INTO command_aliases (command_id, alias_text, is_prefix, is_primary, language)
SELECT id, '/status', true, true, 'en' FROM bot_commands WHERE command_key = 'status';

INSERT INTO command_aliases (command_id, alias_text, is_prefix, is_primary, language)
SELECT id, '/สถานะ', true, true, 'th' FROM bot_commands WHERE command_key = 'status';
```

#### 6.3 อัพเดท FAQ wording ใน Database

```sql
UPDATE portal_faqs 
SET 
  answer_th = 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-ot ใน DM (แชทส่วนตัว) กับบอท',
  answer_en = 'Go to Portal > Work History, click "Cancel" button, or type /cancel-ot in DM (direct message) with the bot.'
WHERE question_th = 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?';

UPDATE portal_faqs 
SET 
  answer_th = 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-dayoff ใน DM (แชทส่วนตัว) กับบอท',
  answer_en = 'Go to Portal > Work History, click "Cancel" button, or type /cancel-dayoff in DM (direct message) with the bot.'
WHERE question_th = 'ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?';
```

---

### 7. Prevention Measures (ป้องกัน AI แก้ผิดจุด)

เพื่อป้องกันไม่ให้ AI แก้ไขส่วนที่ทำงานได้ดีอยู่แล้ว ควร:

1. **อัพเดท Memory/Knowledge:**
   ```markdown
   # Memory: sync/documentation-audit-2026-02-03
   
   VERIFIED WORKING - DO NOT MODIFY:
   - handleStatusCommand (line-webhook) - works correctly
   - cancel_ot/cancel_dayoff commands - works in DM only
   - Quick Actions in Help.tsx - all 20 paths valid
   - MyPoints Streak Shield card - works correctly
   
   NEEDS UPDATE:
   - STATIC_FAQS_TH/EN in Help.tsx - add fallback items
   - portal_faqs wording - clarify "DM only" for cancel commands
   - bot_commands table - add /status record
   ```

2. **Comment Guards ใน Code:**
   ```typescript
   // ⚠️ VERIFIED 2026-02-03: This function works correctly
   // DO NOT REFACTOR unless explicitly requested
   async function handleStatusCommand(...) { ... }
   ```

---

### 8. สรุปการดำเนินการ

**ต้องทำ (Low Risk):**
1. ✏️ อัพเดท STATIC_FAQS ใน Help.tsx เพิ่ม 4-5 รายการ
2. ✏️ อัพเดท portal_faqs ให้ระบุ "DM only" ชัดเจน
3. ➕ เพิ่ม /status ใน bot_commands table

**แนะนำเพิ่มเติม (Optional):**
4. ➕ เพิ่ม /points command (DM only)
5. ➕ เพิ่ม /schedule command (DM only)
6. 🔧 ปรับ /help ให้ filter ตาม role

**ไม่ต้องแก้ไข:**
- handleAttendanceCommand - ทำงานปกติ
- cancel_ot/cancel_dayoff - ทำงานปกติ (DM)
- Quick Actions routes - valid ทั้งหมด
- Streak Shield UI - แสดงถูกต้อง

