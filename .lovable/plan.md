

## แผนแก้ไข: เพิ่ม "Employee" Role ในหน้าจัดการสิทธิ์

### ปัญหาที่พบ
หน้า `/settings/roles` (RoleManagement.tsx) มี `roleDefinitions` เป็น object ที่กำหนดไว้ใน code แบบ hardcoded ไม่ได้ดึงจากฐานข้อมูล `employee_roles` table

**Roles ใน code:**
```text
owner, admin, hr, executive, manager, moderator, field, user
```

**Roles ใน employee_roles table:**
```text
owner, hr, admin, manager, field, employee
```

ขาด **"employee"** role ในหน้า RoleManagement

### วิธีแก้ไข

**Step 1: เพิ่ม 'employee' ใน AppRole type**
ไฟล์: `src/hooks/useUserRole.ts`
```typescript
export type AppRole = 'admin' | 'owner' | 'executive' | 'manager' | 'hr' | 'field' | 'moderator' | 'user' | 'employee';
```

**Step 2: เพิ่ม employee ใน roleDefinitions**
ไฟล์: `src/pages/settings/RoleManagement.tsx`
```typescript
employee: {
  label: 'Employee',
  labelTh: 'พนักงาน',
  description: 'สิทธิ์พื้นฐานสำหรับพนักงานทั่วไป',
  color: 'bg-slate-500',
  icon: User,
  priority: 9, // ต่ำสุด
},
```

**Step 3: เพิ่ม employee ใน rolePriority**
ไฟล์: `src/hooks/useUserRole.ts`
```typescript
const rolePriority = {
  // ...existing
  employee: 9,
};
```

**Step 4: เพิ่ม webapp_menu_config สำหรับ employee role**
```sql
INSERT INTO webapp_menu_config (role, menu_group, can_access)
SELECT 'employee', menu_group, false
FROM webapp_menu_config
WHERE role = 'user'
ON CONFLICT DO NOTHING;
```

**Step 5: เพิ่ม webapp_page_config สำหรับ employee role**
```sql
INSERT INTO webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT 'employee', menu_group, page_path, page_name, false
FROM webapp_page_config
WHERE role = 'user'
ON CONFLICT DO NOTHING;
```

### ไฟล์ที่ต้องแก้ไข
1. `src/hooks/useUserRole.ts` - เพิ่ม type และ priority
2. `src/pages/settings/RoleManagement.tsx` - เพิ่ม roleDefinitions
3. Database migration - เพิ่ม config entries

### ผลลัพธ์
- หน้า `/settings/roles` จะแสดง **Employee** role ในรายการ
- Admin สามารถกำหนดสิทธิ์เมนู/หน้าย่อยให้ Employee role ได้

