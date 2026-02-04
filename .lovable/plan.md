

## แผนแก้ไข: Employee Inactive Bug + Branch Archive System

### 1. Root Cause Analysis

#### ปัญหา 1: พนักงาน "Pass" ยังแสดง Active

| Field | ค่าในฐานข้อมูล | ปัญหา |
|-------|---------------|-------|
| `is_active` | `false` | ✅ ถูกต้อง (user ตั้งค่าแล้ว) |
| `status` | `active` | ❌ ไม่ถูก sync |

**สาเหตุ 1 - Save Logic Bug (line 189):**
```typescript
status: isComplete ? 'active' : 'new'  // ❌ ไม่ check is_active เลย!
```
เมื่อ save พนักงานที่มีข้อมูลครบ ระบบจะตั้ง `status = 'active'` เสมอ ไม่ว่า `is_active` จะเป็นอะไร

**สาเหตุ 2 - Display Logic Bug (line 764):**
```typescript
employee.status === 'active' || employee.is_active ? 'Active' : 'Inactive'
// ❌ ถ้า status = 'active' จะแสดง Active แม้ว่า is_active = false
```

#### ปัญหา 2: สาขาที่ปิดแล้วยังแสดงในรายงาน

| สาขา | is_deleted | มีพนักงาน | ปัญหา |
|------|-----------|----------|-------|
| East Ville | `false` | 0 | ยังแสดง "ไม่มีพนักงาน" |
| Siam Center | `false` | 0 | ยังแสดง "ไม่มีพนักงาน" |
| Phuket | `false` | 0 | ยังแสดง "ไม่มีพนักงาน" |
| testo | `false` | 0 | ยังแสดง "ไม่มีพนักงาน" |

**สาเหตุ:** สาขาเหล่านี้ไม่ได้ถูก soft-delete จึงยังแสดงในรายงาน

---

### 2. Solution Design

#### 2.1 แก้ไข Employee Status Sync

**File: `src/pages/attendance/Employees.tsx`**

**แก้ Save Logic (line 189):**
```typescript
// BEFORE:
status: isComplete ? 'active' : 'new'

// AFTER:
status: !data.is_active ? 'inactive' : (isComplete ? 'active' : 'new')
```

**แก้ Display Logic (lines 754-765):**
```typescript
// BEFORE:
employee.status === 'new' ? 'secondary' : 
employee.status === 'active' || employee.is_active ? 'default' : 'outline'

// AFTER:
!employee.is_active ? 'outline' :
employee.status === 'new' ? 'secondary' : 'default'

// Text - BEFORE:
employee.status === 'new' ? 'New' : employee.status === 'active' || employee.is_active ? 'Active' : 'Inactive'

// Text - AFTER:
!employee.is_active ? 'Inactive' : employee.status === 'new' ? 'New' : 'Active'
```

#### 2.2 Branch Archive System (เลือกใช้ Soft Delete)

**Recommendation: ใช้ Soft Delete ที่มีอยู่แล้ว**

เหตุผล:
1. ✅ ระบบ soft delete (`is_deleted`) มีอยู่แล้วใน Branches.tsx
2. ✅ มีปุ่ม Restore สำหรับกู้คืน
3. ✅ ไม่ต้องเพิ่ม column ใหม่
4. ✅ ข้อมูลเก่ายังอยู่ ไม่สูญหาย

**เปรียบเทียบ:**

| Option | ข้อดี | ข้อเสีย |
|--------|-------|---------|
| ลบจริง (Hard Delete) | Clean | ข้อมูลหายถาวร, FK constraint issues |
| Soft Delete (แนะนำ) | กู้คืนได้, มีอยู่แล้ว | ต้อง filter ทุกที่ |
| เพิ่ม is_active | แยกความหมาย deleted vs archived | ต้องเพิ่ม column, migration, แก้ code หลายจุด |

#### 2.3 ปรับปรุง Daily Summary

**File: `supabase/functions/attendance-daily-summary/index.ts`**

ปรับ `generateSummary` function ให้ข้ามสาขาที่ไม่มีพนักงาน active:

```typescript
// BEFORE (line 237-240):
if (!employees || employees.length === 0) {
  branchSummaries.push(`📍 ${branch.name}\n⏸️ ไม่มีพนักงานในสาขานี้`);
  continue;
}

// AFTER:
if (!employees || employees.length === 0) {
  // Skip empty branches in summary - don't show "ไม่มีพนักงาน"
  console.log(`[generateSummary] Skipping empty branch: ${branch.name}`);
  continue;
}
```

---

### 3. Implementation Plan

| ลำดับ | ไฟล์ | การแก้ไข | Risk |
|-------|------|---------|------|
| 1 | `src/pages/attendance/Employees.tsx` | แก้ save logic และ display logic | ต่ำ |
| 2 | `supabase/functions/attendance-daily-summary/index.ts` | ข้ามสาขาว่างใน report | ต่ำ |
| 3 | ฐานข้อมูล | Soft delete สาขาที่ปิด + sync Pass status | ต่ำ |

---

### 4. รายละเอียดการแก้ไข

#### 4.1 Employees.tsx - Save Logic (line 179-190)

```typescript
const saveMutation = useMutation({
  mutationFn: async (data: typeof formData) => {
    const isComplete = data.full_name && data.role_id && data.branch_id;
    
    const cleanedData = {
      ...data,
      branch_id: data.branch_id || null,
      role_id: data.role_id || null,
      // FIX: Respect is_active when setting status
      status: !data.is_active ? 'inactive' : (isComplete ? 'active' : 'new')
    };
    // ... rest unchanged
  }
});
```

#### 4.2 Employees.tsx - Badge Display (lines 754-765)

```tsx
<Badge 
  variant={
    !employee.is_active ? 'outline' :
    employee.status === 'new' ? 'secondary' : 'default'
  }
  className={cn(
    "text-xs",
    employee.status === 'new' && employee.is_active && "bg-yellow-100 text-yellow-800 ..."
  )}
>
  {!employee.is_active ? 'Inactive' : employee.status === 'new' ? 'New' : 'Active'}
</Badge>
```

#### 4.3 Daily Summary - Skip Empty Branches (line 237-240)

```typescript
// Handle empty branches - skip silently instead of showing in report
if (!employees || employees.length === 0) {
  console.log(`[generateSummary] Skipping empty branch: ${branch.name}`);
  continue;  // ❌ Remove: branchSummaries.push(`📍 ${branch.name}\n⏸️ ไม่มีพนักงาน...`);
}
```

---

### 5. Database Fixes

หลังแก้ code แล้ว ต้อง:

**5.1 Sync Pass status:**
```sql
UPDATE employees 
SET status = 'inactive' 
WHERE is_active = false AND status != 'inactive';
```

**5.2 Soft delete สาขาที่ปิด:**

สามารถทำได้ 2 วิธี:
- **วิธี A (UI):** ไปที่ Attendance > Branches > คลิกปุ่มถังขยะบนสาขาที่ต้องการปิด
- **วิธี B (SQL):**
```sql
UPDATE branches 
SET is_deleted = true, deleted_at = NOW() 
WHERE name IN ('East Ville', 'Siam Center', 'Phuket', 'testo');
```

---

### 6. Cross-Feature Impact Analysis

| Feature | ผลกระทบ | การตรวจสอบ |
|---------|---------|-----------|
| Daily Summary | ✅ จะไม่แสดงสาขาว่างอีกต่อไป | ทดสอบรายงานประจำวัน |
| Attendance Reports | ✅ is_active filter มีอยู่แล้ว | ไม่กระทบ |
| Point System | ✅ `.eq('is_active', true)` มีอยู่แล้ว | ไม่กระทบ |
| Portal | ✅ ใช้ is_active อยู่แล้ว | ไม่กระทบ |
| Work Sessions | ✅ `.eq('is_active', true)` มีอยู่แล้ว | ไม่กระทบ |

---

### 7. Verification Checklist

หลังแก้ไขแล้ว ต้องตรวจสอบ:

**Employee:**
1. [ ] แก้ไข Pass ใน UI → Save → Badge ต้องขึ้น "Inactive"
2. [ ] ตรวจสอบ DB: `is_active = false` และ `status = 'inactive'`
3. [ ] Daily summary ไม่แสดงชื่อ Pass ในรายงาน

**Branches:**
1. [ ] Soft delete สาขา East Ville, Siam Center, Phuket, testo
2. [ ] Daily summary ไม่แสดงสาขาเหล่านี้อีก
3. [ ] Toggle "Show Deleted" ใน Branches page แสดงสาขาที่ลบได้
4. [ ] สามารถ Restore กลับมาได้

---

### 8. Prevention Measures

เพิ่ม comment ใน `Employees.tsx`:

```typescript
// ⚠️ IMPORTANT: When is_active = false, status must be 'inactive'
// This ensures:
// 1. Badge displays correctly
// 2. Employee excluded from reports/points/summaries
// DO NOT change status logic without updating badge display logic too
```

