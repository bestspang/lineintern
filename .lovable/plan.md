

## ✅ เสร็จสิ้น: ระบบสิทธิ์ป้องกันการแก้ไขตัวเองและผู้มี Role สูงกว่า (ยกเว้น Admin/Owner)

### สรุปความต้องการ

| Role | ดู/แก้ไขตัวเอง | ดู/แก้ไขคนอื่น |
|------|---------------|---------------|
| **owner** | ✅ ได้ | ✅ ได้ทุกคน |
| **admin** | ✅ ได้ | ✅ ได้ทุกคน |
| **hr, manager, field, etc.** | ❌ ไม่ได้ (grayed) | ✅ ได้เฉพาะ role ≤ ตัวเอง |

---

### การเปลี่ยนแปลงที่ทำ

#### 1. ✅ แก้ไข `src/hooks/useUserRole.ts`

- แก้ไข `canManageEmployee()` function
- Admin/Owner สามารถดู/แก้ไขตัวเองได้
- Role อื่น (hr, manager, field, etc.) ไม่สามารถดู/แก้ไขตัวเองได้ (`canView: false`, `canEdit: false`)

#### 2. ✅ แก้ไข `src/pages/attendance/Payroll.tsx`

- เพิ่ม `useUserRole` hook
- เพิ่ม query สำหรับหา current user's employee ID
- เพิ่ม `employee_role` ใน employees query
- แถวพนักงานที่ไม่มีสิทธิ์ดูจะแสดงเป็นสีจางและกดไม่ได้ (`opacity-40 pointer-events-none`)

#### 3. ✅ แก้ไข `src/pages/attendance/EmployeeDetail.tsx`

- เพิ่ม permission check และ redirect ถ้าไม่มีสิทธิ์
- แสดง toast error และ redirect ไป `/attendance/employees`

#### 4. ✅ แก้ไข `src/pages/attendance/EmployeeSettings.tsx`

- เพิ่ม permission check และ redirect ถ้าไม่มีสิทธิ์
- แสดง toast error และ redirect ไป `/attendance/employees`

#### 5. ✅ แก้ไข `src/pages/attendance/EmployeeHistory.tsx`

- เพิ่ม permission check และ redirect ถ้าไม่มีสิทธิ์ (สำหรับ ID-based access)
- Token-based access (จาก LINE notification) ยังทำงานได้ปกติ

---

### ผลลัพธ์ที่ได้

| สถานการณ์ | ผลลัพธ์ |
|-----------|--------|
| **Admin** ดู/แก้ payroll ตัวเอง | ✅ ได้ |
| **Owner** ดู/แก้ payroll ตัวเอง | ✅ ได้ |
| **Manager** ดู payroll ตัวเอง | ❌ ไม่ได้ (grayed) |
| **HR** ดู payroll ตัวเอง | ❌ ไม่ได้ (grayed) |
| **Manager** ดู payroll Owner/Admin | ❌ ไม่ได้ (grayed) |
| **Manager** ดู payroll พนักงานธรรมดา | ✅ ได้ |
| เข้า `/employees/:id` ของตัวเองผ่าน URL (non-admin) | ❌ redirect กลับ |
| เข้า `/employees/:id` ของตัวเองผ่าน URL (admin/owner) | ✅ ได้ |
