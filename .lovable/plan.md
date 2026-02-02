
## แผนปรับ Payroll Dashboard ให้ตรงกับ Employees

### สรุปปัญหาปัจจุบัน

| ส่วน | Employees.tsx | Payroll.tsx |
|------|---------------|-------------|
| Permission check | ✅ `{ canView, canEdit }` | ❌ `{ canView }` เท่านั้น |
| ปุ่ม Edit | ✅ disabled เมื่อ `!canEdit` | ❌ ไม่ได้เช็ค |
| Mini Calendar click | - | ❌ เปิด dialog ได้แม้ไม่มีสิทธิ์แก้ |
| Bulk mode | - | ❌ ใช้ได้แม้ไม่มีสิทธิ์แก้ |

**ผลลัพธ์ที่ต้องการ:**
- HR ดูได้หมดทุกคน (รวมตัวเอง)
- HR แก้ไขได้เฉพาะ Manager และต่ำกว่า
- HR แก้ไขตัวเองไม่ได้
- Admin/Owner ทำได้ทุกอย่าง

---

### การเปลี่ยนแปลง

#### 1. ดึง `canEdit` จาก `canManageEmployee` (บรรทัด 2320)

```typescript
// ก่อน
const { canView } = canManageEmployee(empPriority, isSelf);

// หลัง
const { canView, canEdit } = canManageEmployee(empPriority, isSelf);
```

---

#### 2. Disable ปุ่ม Edit เมื่อไม่มีสิทธิ์ (บรรทัด ~2505)

```typescript
// ก่อน
disabled={currentPeriod?.status === 'completed'}

// หลัง
disabled={currentPeriod?.status === 'completed' || !canEdit}
```

---

#### 3. Disable ปุ่ม Bulk Mode เมื่อไม่มีสิทธิ์ (บรรทัด ~2437)

```typescript
// ก่อน
disabled={currentPeriod?.status === 'completed'}

// หลัง
disabled={currentPeriod?.status === 'completed' || !canEdit}
```

---

#### 4. ป้องกัน Mini Calendar click เมื่อไม่มีสิทธิ์ (บรรทัด ~2419-2423)

```typescript
// ก่อน
onDayClick={(date, data) => {
  setEditingEmployeeId(emp.id);
  setEditingDate(date);
  setAttendanceEditDialogOpen(true);
}}

// หลัง
onDayClick={(date, data) => {
  if (!canEdit) return; // ป้องกันเปิด dialog
  setEditingEmployeeId(emp.id);
  setEditingDate(date);
  setAttendanceEditDialogOpen(true);
}}
```

---

#### 5. ป้องกัน Start Date Warning click เมื่อไม่มีสิทธิ์ (บรรทัด ~2369-2380)

```typescript
// ก่อน
onClick={(e) => {
  e.stopPropagation();
  if (w.type === 'no_start_date') {
    // Open dialog...
  }
}}

// หลัง
onClick={(e) => {
  e.stopPropagation();
  if (!canEdit) return; // ป้องกันเปิด dialog
  if (w.type === 'no_start_date') {
    // Open dialog...
  }
}}
```

---

#### 6. Visual feedback: ซ่อน/ลดความชัดของปุ่มที่ disabled

เพิ่ม visual cue เมื่อไม่มีสิทธิ์แก้ไข:

```typescript
// ปุ่ม Edit
<Button
  variant="ghost"
  size="icon"
  className={cn("h-7 w-7", !canEdit && "opacity-50")}
  disabled={currentPeriod?.status === 'completed' || !canEdit}
>
```

---

### ไฟล์ที่แก้ไข

| ไฟล์ | จำนวนจุดที่แก้ |
|------|---------------|
| `src/pages/attendance/Payroll.tsx` | 5 จุด |

---

### ผลลัพธ์ที่คาดหวัง

| สถานการณ์ | ดูข้อมูล | แก้ไข Payroll | แก้ Attendance | Bulk Edit |
|-----------|---------|---------------|----------------|-----------|
| HR ดู Owner/Admin | ✅ | ❌ disabled | ❌ disabled | ❌ disabled |
| HR ดูตัวเอง | ✅ | ❌ disabled | ❌ disabled | ❌ disabled |
| HR ดู Manager/Field/Employee | ✅ | ✅ | ✅ | ✅ |
| Admin/Owner ดูทุกคน | ✅ | ✅ | ✅ | ✅ |

---

### หมายเหตุ

- Logic permission ใน `useUserRole.ts` ถูกต้องแล้ว ไม่ต้องแก้ไข
- แก้เฉพาะ UI ใน Payroll.tsx ให้เช็ค `canEdit` ก่อนอนุญาตการแก้ไข
- ไม่กระทบ functionality ที่ทำงานอยู่ เพิ่มเฉพาะการตรวจสอบสิทธิ์
