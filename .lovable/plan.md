
## แผนแก้ไข: ระบบตั้งค่า Notification สำหรับ Auto Checkout

### ปัญหา
ข้อความ Auto Checkout ถูกส่งไปยังกลุ่ม LINE โดยอัตโนมัติทุกครั้งโดยไม่มีตัวเลือกเปิด/ปิด

---

### การแก้ไข

#### 1. Database Migration - เพิ่ม columns ใหม่

**ตาราง:** `attendance_settings`

```sql
ALTER TABLE attendance_settings
ADD COLUMN IF NOT EXISTS auto_checkout_notify_dm BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_checkout_notify_group BOOLEAN DEFAULT true;

COMMENT ON COLUMN attendance_settings.auto_checkout_notify_dm IS 
  'Send auto-checkout notification to employee DM';
COMMENT ON COLUMN attendance_settings.auto_checkout_notify_group IS 
  'Send auto-checkout notification to announcement group';
```

| Column | Type | Default | คำอธิบาย |
|--------|------|---------|---------|
| `auto_checkout_notify_dm` | boolean | true | ส่งแจ้งเตือนไปหาพนักงาน |
| `auto_checkout_notify_group` | boolean | true | ส่งแจ้งเตือนไปกลุ่มประกาศ |

---

#### 2. แก้ไข Edge Function - `auto-checkout-midnight`

**ไฟล์:** `supabase/functions/auto-checkout-midnight/index.ts`

**เพิ่ม Query ดึง settings (ก่อน loop):**
```typescript
// Fetch notification settings
const { data: notifySettings } = await supabase
  .from('attendance_settings')
  .select('auto_checkout_notify_dm, auto_checkout_notify_group')
  .eq('scope', 'global')
  .maybeSingle();

const notifyDM = notifySettings?.auto_checkout_notify_dm ?? true;
const notifyGroup = notifySettings?.auto_checkout_notify_group ?? true;
```

**แก้ไข LINE notification section (บรรทัด ~300-374):**
```typescript
// Send LINE notification to employee (only if enabled)
if (notifyDM && employee.line_user_id) {
  // ... existing DM code ...
}

// Post to announcement group (only if enabled)
if (notifyGroup && announcementGroupId) {
  // ... existing group code ...
}
```

---

#### 3. แก้ไข UI Settings Page

**ไฟล์:** `src/pages/attendance/Settings.tsx`

**เพิ่มใน formData state:**
```typescript
auto_checkout_notify_dm: true,
auto_checkout_notify_group: true,
```

**เพิ่ม UI Card ใหม่:**
```text
┌─────────────────────────────────────────────────────┐
│ 🌙 Auto Checkout Notification Settings              │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [✓] Send to Employee DM                             │
│     Notify employee when auto-checkout occurs       │
│                                                     │
│ [  ] Send to Announcement Group                     │
│     Post auto-checkout info to LINE group           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### Technical Details

**Behavior Matrix:**

| DM | Group | ผลลัพธ์ |
|----|-------|--------|
| ✓ | ✓ | ส่งทั้ง DM และ Group (default) |
| ✓ | ✗ | ส่งเฉพาะ DM |
| ✗ | ✓ | ส่งเฉพาะ Group |
| ✗ | ✗ | ไม่ส่ง notification ใดๆ |

**Files to modify:**
1. **Database Migration** - เพิ่ม 2 columns
2. `supabase/functions/auto-checkout-midnight/index.ts` - เพิ่ม settings check
3. `src/pages/attendance/Settings.tsx` - เพิ่ม UI controls

---

### สรุปการเปลี่ยนแปลง

| รายการ | รายละเอียด |
|--------|-----------|
| **Migration** | เพิ่ม 2 columns ใน attendance_settings |
| **Edge Function** | เพิ่ม 10 บรรทัด (query + condition checks) |
| **Settings UI** | เพิ่ม ~50 บรรทัด (Card + 2 switches) |
| **Impact** | Admin สามารถเปิด/ปิด notification แต่ละช่องทาง |
| **Default** | ทั้งสอง option เปิดอยู่ (backward compatible) |
