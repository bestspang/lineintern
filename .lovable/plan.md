

## แผนแก้ไข - Approved Late Start ไม่แสดง "มาตรงเวลา"

### สาเหตุของปัญหา (Root Cause)

**ไฟล์:** `src/pages/attendance/Payroll.tsx` บรรทัด 712-722

เมื่อบันทึก "อนุญาตเข้าสาย" ระบบจะเก็บ `override_status: 'on_time'` ในฐานข้อมูล:

| Field | Value |
|-------|-------|
| approved_late_start | true |
| override_status | **on_time** |

แต่ statusMapping ใน Payroll.tsx **ไม่มี key 'on_time'**:

```typescript
const statusMapping = {
  'present': 'present',
  'day_off': 'day_off',
  'vacation': 'leave',
  'sick': 'leave',
  'personal': 'leave',
  'absent': 'absent',
  'holiday': 'holiday',
  // ขาด! 'on_time' → ทำให้ fallback กลับไปใช้ status เดิม (late)
};
```

**ผลลัพธ์:** `statusMapping['on_time']` = undefined → fallback ไป status เดิม (late) → ยังแสดง "มาสาย"

---

### การแก้ไข

**บรรทัด 713-721 เพิ่ม `'on_time': 'present'`:**

```typescript
const statusMapping: Record<string, DayStatus['status']> = {
  'present': 'present',
  'on_time': 'present',    // เพิ่มบรรทัดนี้!
  'day_off': 'day_off',
  'vacation': 'leave',
  'sick': 'leave',
  'personal': 'leave',
  'absent': 'absent',
  'holiday': 'holiday',
};
```

---

### สรุป

| ไฟล์ | บรรทัด | การเปลี่ยนแปลง |
|------|--------|---------------|
| `Payroll.tsx` | 714 | เพิ่ม `'on_time': 'present'` ใน statusMapping |

---

### ผลลัพธ์ที่คาดหวัง

**Before:** 
- บันทึก `approved_late_start: true` → DB เก็บ `on_time` → statusMapping ไม่รู้จัก → แสดง "มาสาย" ❌

**After:** 
- บันทึก `approved_late_start: true` → DB เก็บ `on_time` → statusMapping = 'present' → แสดง "มาตรงเวลา" ✅

