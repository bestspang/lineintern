

## เพิ่มปุ่มปิด/เปิด การสร้าง Task อัตโนมัติ

### ปัญหา
ระบบ Work Assignment Detection ใน line-webhook ทำงานทุกข้อความในกลุ่ม (line 10086-10119) โดยไม่มี toggle ปิด/เปิด ทำให้ปิดไม่ได้เมื่อไม่ต้องการใช้งาน

### การแก้ไข (3 files, surgical changes)

**1. Settings UI** (`src/pages/attendance/Settings.tsx`)
- เพิ่ม `work_assignment_enabled: true` ใน formData default (line 51)
- เพิ่มการอ่านค่าจาก settings (line 142)
- เพิ่ม Switch toggle ในส่วน "Work Reminder & Summary" card (หลัง line 646) พร้อมคำอธิบาย:
  - Label: "เปิดใช้งาน Auto Task Creation"
  - Description: "สร้างงานอัตโนมัติเมื่อมีการมอบหมายงานในกลุ่ม LINE เช่น '@ชื่อ ทำงาน X ภายในวันนี้'"

**2. Database** — ไม่ต้อง migrate
- `attendance_settings` table ใช้ JSONB-style columns ที่รับ field ใหม่ได้เลย (เหมือน `work_reminder_enabled`)
- ถ้า column ยังไม่มีจะต้องเพิ่ม migration

**3. Backend** (`supabase/functions/line-webhook/index.ts`)
- ที่ line 10086-10087 เพิ่ม check ก่อน run detectWorkAssignment:

```text
// Before:
if (!isDM) {
  const assignments = await detectWorkAssignment(...)

// After:
if (!isDM) {
  // Check if work assignment detection is enabled
  const { data: globalSettings } = await supabase
    .from('attendance_settings')
    .select('work_assignment_enabled')
    .eq('scope', 'global')
    .is('branch_id', null)
    .is('employee_id', null)
    .maybeSingle();
  
  const workAssignmentEnabled = globalSettings?.work_assignment_enabled ?? true;
  
  if (workAssignmentEnabled) {
    const assignments = await detectWorkAssignment(...)
    // ... existing logic
  }
}
```

### ต้องตรวจสอบก่อน implement
- เช็คว่า `attendance_settings` มี column `work_assignment_enabled` หรือยัง ถ้ายังต้อง migrate เพิ่ม

### Files to modify

| File | Change | Risk |
|------|--------|------|
| `src/pages/attendance/Settings.tsx` | เพิ่ม toggle (ตามแบบ work_reminder_enabled) | ต่ำมาก |
| `supabase/functions/line-webhook/index.ts` | เพิ่ม setting check ก่อน detectWorkAssignment | ต่ำ |
| Migration (ถ้าจำเป็น) | เพิ่ม column `work_assignment_enabled` | ไม่มี risk |

### สิ่งที่จะไม่แตะ
- detectWorkAssignment function เอง
- createWorkTask function
- Work Reminder / Work Summary logic
- ส่วนอื่นทั้งหมดของ line-webhook

### Regression: ZERO
- เพิ่ม toggle ใหม่ (additive)
- Default = true (behavior เดิมไม่เปลี่ยน)
- ถ้าปิด toggle จะ skip ทั้ง block detection
