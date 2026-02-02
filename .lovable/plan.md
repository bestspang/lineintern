

## แผน Implementation: Permission HR + Link Webapp User

### สรุปความต้องการ (ปรับปรุง)

| Role | ดูตัวเอง | แก้ไขตัวเอง | ดูคนอื่น | แก้ไขคนอื่น |
|------|---------|------------|---------|------------|
| **Owner/Admin** | ✅ ได้ | ✅ ได้ | ✅ ทุกคน | ✅ ทุกคน |
| **HR** | ✅ ได้ | ❌ ไม่ได้ | ✅ ทุกคน | เฉพาะ role ≤ Manager |
| **Manager/Field** | ❌ ไม่ได้ | ❌ ไม่ได้ | ตาม priority | ตาม priority |

---

### การเปลี่ยนแปลง

#### 1. Database Migration: เพิ่ม `auth_user_id` column

```sql
ALTER TABLE employees ADD COLUMN auth_user_id UUID REFERENCES auth.users(id);
CREATE INDEX idx_employees_auth_user_id ON employees(auth_user_id);

-- Link mefonn กับ webapp user
UPDATE employees 
SET auth_user_id = '2b67767d-67cb-4f02-bf9f-e0f166cc7a18'
WHERE full_name = 'mefonn';
```

---

#### 2. แก้ไข `src/hooks/useUserRole.ts`

**เพิ่ม priority maps แยก View/Edit:**

```typescript
const userToMaxViewPriority: Record<AppRole, number> = {
  owner: 999, admin: 999, hr: 999,
  executive: 5, manager: 1, moderator: 0, field: 0, user: 0, employee: 0,
};

const userToMaxEditPriority: Record<AppRole, number> = {
  owner: 999, admin: 999, hr: 5,  // HR แก้ไขได้แค่ Manager ลงไป
  executive: 5, manager: 1, moderator: 0, field: 0, user: 0, employee: 0,
};
```

**ปรับ `canManageEmployee` function:**

```typescript
const canManageEmployee = (...): EmployeeManagePermission => {
  // Admin/Owner: ทำได้ทุกอย่างรวมตัวเอง
  if (roleData === 'admin' || roleData === 'owner') {
    return { canEdit: true, canView: true };
  }
  
  // HR: ดูตัวเองได้ แก้ไขไม่ได้
  if (isSelf && roleData === 'hr') {
    return { canEdit: false, canView: true };
  }
  
  // Other roles: ถ้าเป็นตัวเอง ดูและแก้ไขไม่ได้
  if (isSelf) {
    return { canEdit: false, canView: false };
  }
  
  // เช็ค priority สำหรับคนอื่น
  return {
    canView: targetPriority <= userToMaxViewPriority[roleData],
    canEdit: targetPriority <= userToMaxEditPriority[roleData],
  };
};
```

---

#### 3. ปรับ Query หา Current User Employee (6 ไฟล์)

**ไฟล์:** `Employees.tsx`, `Payroll.tsx`, `EmployeeDetail.tsx`, `EmployeeSettings.tsx`, `EmployeeHistory.tsx`

```typescript
const { data: currentUserEmployee } = useQuery({
  queryKey: ['current-user-employee'],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    // Method 1: Direct link via auth_user_id
    const { data: directLink } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    
    if (directLink) return directLink;
    
    // Method 2: Fallback via LINE ID
    const { data: lineUser } = await supabase
      .from('users')
      .select('line_user_id')
      .eq('id', user.id)
      .maybeSingle();
    
    if (lineUser?.line_user_id) {
      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('line_user_id', lineUser.line_user_id)
        .maybeSingle();
      return employee;
    }
    return null;
  }
});
```

---

#### 4. ปรับ UI แสดงสถานะ View-only (Payroll, Employees)

สำหรับ rows ที่ `canView: true, canEdit: false` จะแสดงข้อมูลได้แต่ปุ่ม Edit จะ disabled

---

### ไฟล์ที่จะแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| **Database** | เพิ่ม `auth_user_id` + link mefonn |
| `src/hooks/useUserRole.ts` | แยก view/edit priority + ปรับ logic |
| `src/pages/attendance/Employees.tsx` | ปรับ query + UI |
| `src/pages/attendance/Payroll.tsx` | ปรับ query + UI |
| `src/pages/attendance/EmployeeDetail.tsx` | ปรับ query + redirect logic |
| `src/pages/attendance/EmployeeSettings.tsx` | ปรับ query + redirect logic |
| `src/pages/attendance/EmployeeHistory.tsx` | ปรับ query + redirect logic |

---

### ผลลัพธ์

| สถานการณ์ | ผลลัพธ์ |
|-----------|--------|
| HR (mefonn) ดูตัวเอง | ✅ ได้ (view-only) |
| HR (mefonn) แก้ไขตัวเอง | ❌ ไม่ได้ |
| HR ดู Owner/Admin | ✅ ได้ (view-only) |
| HR แก้ไข Owner/Admin | ❌ ไม่ได้ |
| HR แก้ไข Manager/Field/Employee | ✅ ได้ |
| Manager ดู/แก้ไขตัวเอง | ❌ ไม่ได้ (grayed) |
| Admin/Owner ดู/แก้ไขทุกคน | ✅ ได้ |

