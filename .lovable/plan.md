

## แผนแก้ไข: ระบบสิทธิ์ป้องกันการแก้ไขตัวเองและผู้มี Role สูงกว่า (ยกเว้น Admin/Owner)

### สรุปความต้องการ

| Role | ดู/แก้ไขตัวเอง | ดู/แก้ไขคนอื่น |
|------|---------------|---------------|
| **owner** | ✅ ได้ | ✅ ได้ทุกคน |
| **admin** | ✅ ได้ | ✅ ได้ทุกคน |
| **hr, manager, field, etc.** | ❌ ไม่ได้ (grayed) | ✅ ได้เฉพาะ role ≤ ตัวเอง |

---

### การเปลี่ยนแปลง

#### 1. แก้ไข `src/hooks/useUserRole.ts`

**ปัจจุบัน (บรรทัด 147-167):**
```typescript
const canManageEmployee = (employeeRolePriority: number | null, isSelf: boolean = false): EmployeeManagePermission => {
  if (!roleData) return { canEdit: false, canView: false };
  
  // Admin/Owner can do everything
  if (roleData === 'admin' || roleData === 'owner') {
    return { canEdit: true, canView: true };
  }
  
  const myMaxPriority = userToMaxEmployeeRolePriority[roleData];
  const targetPriority = employeeRolePriority ?? 0;
  
  // If self: can view but not edit
  if (isSelf) {
    return { canEdit: false, canView: true };
  }
  
  // If target priority is higher than what we can manage: no access
  if (targetPriority > myMaxPriority) {
    return { canEdit: false, canView: false };
  }
  
  return { canEdit: true, canView: true };
};
```

**เปลี่ยนเป็น:**
```typescript
const canManageEmployee = (employeeRolePriority: number | null, isSelf: boolean = false): EmployeeManagePermission => {
  if (!roleData) return { canEdit: false, canView: false };
  
  // Admin/Owner can do everything INCLUDING themselves
  if (roleData === 'admin' || roleData === 'owner') {
    return { canEdit: true, canView: true };
  }
  
  // For other roles: if self, cannot view or edit (audit control)
  if (isSelf) {
    return { canEdit: false, canView: false };
  }
  
  const myMaxPriority = userToMaxEmployeeRolePriority[roleData];
  const targetPriority = employeeRolePriority ?? 0;
  
  // If target priority is higher than what we can manage: no access
  if (targetPriority > myMaxPriority) {
    return { canEdit: false, canView: false };
  }
  
  return { canEdit: true, canView: true };
};
```

**สิ่งที่เปลี่ยน:**
- ย้าย `isSelf` check ไปอยู่ **หลัง** admin/owner check
- เปลี่ยน `isSelf` return จาก `{ canEdit: false, canView: true }` เป็น `{ canEdit: false, canView: false }`

---

#### 2. แก้ไข `src/pages/attendance/Payroll.tsx`

เพิ่ม permission check และ gray out rows ที่ไม่มีสิทธิ์

**เพิ่ม imports และ hooks:**
```typescript
import { useUserRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';

// ใน component
const { canManageEmployee } = useUserRole();

// Query หา current user's employee ID
const { data: currentUserEmployee } = useQuery({
  queryKey: ['current-user-employee-payroll'],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
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

**แก้ไข Table Row:**
```typescript
{filteredRecords.map((record) => {
  const isSelf = currentUserEmployee?.id === record.employee_id;
  const empPriority = record.employee?.employee_role?.priority ?? 0;
  const { canView } = canManageEmployee(empPriority, isSelf);
  
  return (
    <TableRow 
      key={record.id}
      className={cn(!canView && "opacity-40 pointer-events-none")}
    >
      {/* ... existing columns ... */}
    </TableRow>
  );
})}
```

---

#### 3. แก้ไข Sub-pages (ป้องกัน direct URL access)

**ไฟล์:**
- `src/pages/attendance/EmployeeDetail.tsx`
- `src/pages/attendance/EmployeeSettings.tsx`
- `src/pages/attendance/EmployeeHistory.tsx`

**เพิ่ม redirect logic:**
```typescript
import { useUserRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const { canManageEmployee } = useUserRole();
const navigate = useNavigate();

// Query current user's employee
const { data: currentUserEmployee } = useQuery({...});

useEffect(() => {
  if (employee && currentUserEmployee !== undefined) {
    const isSelf = currentUserEmployee?.id === employee.id;
    const { canView } = canManageEmployee(employee.role_priority ?? 0, isSelf);
    
    if (!canView) {
      toast.error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลของพนักงานท่านนี้");
      navigate('/attendance/employees');
    }
  }
}, [employee, currentUserEmployee, canManageEmployee, navigate]);
```

---

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `src/hooks/useUserRole.ts` | ย้าย isSelf check หลัง admin/owner, return canView: false |
| `src/pages/attendance/Payroll.tsx` | เพิ่ม permission check, gray out rows |
| `src/pages/attendance/EmployeeDetail.tsx` | เพิ่ม redirect ถ้าไม่มีสิทธิ์ |
| `src/pages/attendance/EmployeeSettings.tsx` | เพิ่ม redirect ถ้าไม่มีสิทธิ์ |
| `src/pages/attendance/EmployeeHistory.tsx` | เพิ่ม redirect ถ้าไม่มีสิทธิ์ |

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

