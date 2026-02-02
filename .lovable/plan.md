

## แผนแก้ไข: HR กด Action แล้วไม่เห็นข้อมูล

### สาเหตุของปัญหา

ปัญหาเกิดจาก **Query ใช้ชื่อ column ที่ไม่มีอยู่ในตาราง `employee_roles`**

| Column ที่ใช้ใน Query | สถานะ | Column ที่ถูกต้อง |
|------------------------|--------|-------------------|
| `name` | ❌ ไม่มี | `role_key` หรือ `display_name_th` |
| `role_name` | ❌ ไม่มี | `role_key` หรือ `display_name_th` |

**Schema จริงของ `employee_roles`:**
- `id` (UUID)
- `role_key` (เช่น 'admin', 'hr', 'manager')
- `display_name_th` (เช่น 'ผู้ดูแลระบบ', 'ฝ่ายบุคคล')
- `display_name_en` (เช่น 'Admin', 'HR')
- `priority` (ตัวเลข)

---

### ไฟล์ที่ต้องแก้ไข (6 ไฟล์)

#### กลุ่ม 1: ใช้ `name` (ไม่มี) → แก้เป็น `role_key`

| ไฟล์ | บรรทัด | Query ที่ผิด |
|------|--------|-------------|
| `src/pages/attendance/Payroll.tsx` | 257 | `employee_roles!role_id(id, name, priority)` |
| `src/pages/attendance/EmployeeSettings.tsx` | 262 | `employee_roles!role_id(id, name, priority)` |
| `src/pages/attendance/EmployeeHistory.tsx` | 101 | `employee_roles!role_id(id, name, priority)` |
| `src/pages/attendance/EmployeeDetail.tsx` | 94 | `employee_roles!role_id(id, name, priority)` |

**แก้เป็น:**
```typescript
employee_role:employee_roles!role_id(id, role_key, priority)
```

#### กลุ่ม 2: ใช้ `role_name` (ไม่มี) → แก้เป็น `role_key`

| ไฟล์ | บรรทัด | Query ที่ผิด |
|------|--------|-------------|
| `src/pages/portal/PortalEmployees.tsx` | 39 | `role:employee_roles(role_name)` |
| `supabase/functions/portal-data/index.ts` | 389 | `role:employee_roles(role_name)` |

**แก้เป็น:**
```typescript
role:employee_roles(role_key)
```

---

### การเปลี่ยนแปลงโดยละเอียด

#### 1. `src/pages/attendance/EmployeeDetail.tsx` (บรรทัด 94)

```typescript
// ก่อน
employee_role:employee_roles!role_id(id, name, priority)

// หลัง
employee_role:employee_roles!role_id(id, role_key, priority)
```

#### 2. `src/pages/attendance/EmployeeSettings.tsx` (บรรทัด 262)

```typescript
// ก่อน
employee_role:employee_roles!role_id(id, name, priority)

// หลัง
employee_role:employee_roles!role_id(id, role_key, priority)
```

#### 3. `src/pages/attendance/EmployeeHistory.tsx` (บรรทัด 101)

```typescript
// ก่อน
employee_role:employee_roles!role_id(id, name, priority)

// หลัง
employee_role:employee_roles!role_id(id, role_key, priority)
```

#### 4. `src/pages/attendance/Payroll.tsx` (บรรทัด 257)

```typescript
// ก่อน
employee_role:employee_roles!role_id(id, name, priority)

// หลัง
employee_role:employee_roles!role_id(id, role_key, priority)
```

#### 5. `src/pages/portal/PortalEmployees.tsx` (บรรทัด 39 และ 57)

```typescript
// บรรทัด 39 - Query
// ก่อน
role:employee_roles(role_name),

// หลัง
role:employee_roles(role_key),

// บรรทัด 57 - Mapping
// ก่อน
role: e.role?.role_name || 'พนักงาน',

// หลัง
role: e.role?.role_key || 'พนักงาน',
```

#### 6. `supabase/functions/portal-data/index.ts` (บรรทัด 389)

```typescript
// ก่อน
.select('branch_id, role:employee_roles(role_name)')

// หลัง
.select('branch_id, role:employee_roles(role_key)')
```

---

### ผลลัพธ์ที่คาดหวัง

| สถานการณ์ | ก่อนแก้ไข | หลังแก้ไข |
|-----------|-----------|-----------|
| HR กดดูรายละเอียดพนักงาน | ❌ Employee Not Found | ✅ เห็นข้อมูล |
| HR กดดู Settings พนักงาน | ❌ column does not exist | ✅ เห็นข้อมูล |
| HR ดู Payroll | ❌ ไม่พบข้อมูลพนักงาน | ✅ เห็นข้อมูล |
| HR กดดูประวัติ (History) | ❌ Error | ✅ เห็นข้อมูล |
| Portal Employees | ❌ Error | ✅ แสดง role ถูกต้อง |

---

### หมายเหตุ

- นี่ไม่ใช่ปัญหา Permission แต่เป็นปัญหา **Query ผิด column name**
- เมื่อ Query ล้มเหลว → `employee = null` → หน้า render "Not Found"
- การแก้ไขนี้จะไม่กระทบ Permission logic ที่ implement ไว้แล้ว

