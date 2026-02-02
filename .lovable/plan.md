

## แผนแก้ไข - ปุ่มบันทึกใน AttendanceEditDialog ไม่ทำงาน

### สาเหตุของปัญหา (Root Cause)

**บรรทัด 131-183 ของ AttendanceEditDialog.tsx:**

```typescript
useEffect(() => {
  if (existingAdjustment) {
    // ... set other fields
    setReason('');  // ← ปัญหาอยู่ตรงนี้!
  } else if (currentData) {
    // ... set other fields  
    setReason('');  // ← และตรงนี้!
  }
}, [existingAdjustment, currentData, open]);
```

**กระบวนการที่เกิดขึ้น:**
1. User เปิด dialog → Query โหลด `existingAdjustment` → useEffect รัน → `setReason('')`
2. User พิมพ์ "ก" ในช่อง "เหตุผลในการแก้ไข"
3. Query อาจ refetch (window focus, stale time, network reconnect)
4. useEffect รันอีกครั้ง → `setReason('')` รีเซ็ตค่าที่พิมพ์ไป
5. `reason.trim()` เป็น falsy → ปุ่มบันทึกกลับมา disabled หรือถ้ากด save ก็จะ throw error

### การแก้ไข

**เพิ่มตัวแปร `isInitialLoad` เพื่อป้องกันการ reset form เมื่อ query refetch:**

#### 1. เพิ่ม useRef สำหรับ track initial load (หลังบรรทัด 91)

```typescript
const [approvedLateReason, setApprovedLateReason] = useState<string>('');
const isInitializedRef = useRef(false);  // เพิ่มบรรทัดนี้
```

#### 2. แก้ไข useEffect (บรรทัด 131-183)

**จาก:**
```typescript
useEffect(() => {
  if (existingAdjustment) {
    setSelectedStatus(existingAdjustment.override_status || '');
    setCheckInTime(existingAdjustment.override_check_in || '');
    setCheckOutTime(existingAdjustment.override_check_out || '');
    setOtHours(String(existingAdjustment.override_ot_hours || 0));
    setWorkHours(existingAdjustment.override_work_hours ? String(existingAdjustment.override_work_hours) : '');
    setReason('');  // ← ปัญหา
    setApprovedLateStart((existingAdjustment as any).approved_late_start || false);
    setApprovedLateReason((existingAdjustment as any).approved_late_reason || '');
  } else if (currentData) {
    // ... same issue
    setReason('');  // ← ปัญหา
  } else {
    // Reset form
    setReason('');
  }
}, [existingAdjustment, currentData, open]);
```

**เป็น:**
```typescript
useEffect(() => {
  // Only initialize form on first open or when dialog reopens
  // Skip re-initialization from query refetches to preserve user input
  if (!open) {
    isInitializedRef.current = false;
    return;
  }
  
  if (isInitializedRef.current) {
    // Already initialized - don't reset user's input on query refetch
    return;
  }
  
  // Mark as initialized
  isInitializedRef.current = true;
  
  if (existingAdjustment) {
    setSelectedStatus(existingAdjustment.override_status || '');
    setCheckInTime(existingAdjustment.override_check_in || '');
    setCheckOutTime(existingAdjustment.override_check_out || '');
    setOtHours(String(existingAdjustment.override_ot_hours || 0));
    setWorkHours(existingAdjustment.override_work_hours ? String(existingAdjustment.override_work_hours) : '');
    setReason(''); // Reset only on initial load
    setApprovedLateStart(existingAdjustment.approved_late_start || false);
    setApprovedLateReason(existingAdjustment.approved_late_reason || '');
  } else if (currentData) {
    // ... existing code
    setReason(''); // Reset only on initial load
  } else {
    // Reset form
    setSelectedStatus('');
    setCheckInTime('');
    setCheckOutTime('');
    setWorkHours('');
    setOtHours('0');
    setReason('');
    setApprovedLateStart(false);
    setApprovedLateReason('');
  }
}, [existingAdjustment, currentData, open]);
```

#### 3. เพิ่ม import useRef (บรรทัด 6)

```typescript
import { useState, useEffect, useRef } from "react";
```

---

### สรุปไฟล์ที่ต้องแก้ไข

| ไฟล์ | บรรทัด | การเปลี่ยนแปลง |
|------|--------|---------------|
| `AttendanceEditDialog.tsx` | 6 | เพิ่ม `useRef` ใน import |
| `AttendanceEditDialog.tsx` | 91 | เพิ่ม `isInitializedRef` |
| `AttendanceEditDialog.tsx` | 131-183 | แก้ไข useEffect ให้ skip re-initialization |

---

### ผลลัพธ์ที่คาดหวัง

**Before:** 
- พิมพ์เหตุผล → query refetch → reason ถูก reset → บันทึกไม่ได้

**After:** 
- พิมพ์เหตุผล → query refetch → reason ยังคงค่าเดิม → บันทึกได้สำเร็จ
- Dialog จะ reset เฉพาะเมื่อ **ปิดและเปิดใหม่** เท่านั้น

