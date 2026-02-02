
## แผนแก้ไข: แยก menu_group ใน webapp_page_config ให้ตรงกับ Sidebar

### ปัญหาที่พบ

ปัจจุบัน `webapp_page_config` มีหน้าทั้งหมด **36 หน้า** รวมอยู่ใน `menu_group = 'Attendance'` เดียว

แต่ **sidebar จริง** (DashboardLayout.tsx) แยกออกเป็น **6 groups**:

| Menu Group | จำนวนหน้า | ตัวอย่างหน้า |
|------------|----------|-------------|
| Attendance | 12 | Dashboard, Employees, Branches |
| Schedule & Leaves | 7 | Shift Templates, Holidays, Leave Balance |
| Overtime | 3 | OT Requests, OT Summary |
| Payroll | 3 | Payroll, Work History |
| Points & Rewards | 5 | Happy Points, Rewards |
| Deposits | 2 | Deposits, Deposit Settings |

---

### วิธีแก้ไข

**Database Migration เพื่อ UPDATE menu_group ให้ตรงกับ sidebar**

```sql
-- 1. Schedule & Leaves (7 pages)
UPDATE webapp_page_config SET menu_group = 'Schedule & Leaves'
WHERE page_path IN (
  '/attendance/shift-templates',
  '/attendance/schedules',
  '/attendance/holidays',
  '/attendance/birthdays',
  '/attendance/leave-balance',
  '/attendance/early-leave-requests',
  '/attendance/flexible-day-off-requests',
  '/attendance/flexible-day-off'
);

-- 2. Overtime (3 pages)
UPDATE webapp_page_config SET menu_group = 'Overtime'
WHERE page_path IN (
  '/attendance/overtime-requests',
  '/attendance/overtime-summary',
  '/attendance/overtime-management'
);

-- 3. Payroll (3 pages)
UPDATE webapp_page_config SET menu_group = 'Payroll'
WHERE page_path IN (
  '/attendance/payroll',
  '/attendance/payroll-ytd',
  '/attendance/work-history'
);

-- 4. Points & Rewards (5 pages)
UPDATE webapp_page_config SET menu_group = 'Points & Rewards'
WHERE page_path IN (
  '/attendance/happy-points',
  '/attendance/point-transactions',
  '/attendance/point-rules',
  '/attendance/rewards',
  '/attendance/redemption-approvals'
);

-- 5. Deposits (2 pages)
UPDATE webapp_page_config SET menu_group = 'Deposits'
WHERE page_path IN (
  '/attendance/deposits',
  '/attendance/deposit-settings'
);
```

---

### ผลลัพธ์หลังแก้ไข

**ก่อนแก้ไข:**
| Menu Group | จำนวนหน้า |
|------------|----------|
| Attendance | 36 หน้า |

**หลังแก้ไข:**
| Menu Group | จำนวนหน้า |
|------------|----------|
| Attendance | 16 หน้า |
| Schedule & Leaves | 8 หน้า |
| Overtime | 3 หน้า |
| Payroll | 3 หน้า |
| Points & Rewards | 5 หน้า |
| Deposits | 2 หน้า |

---

### ข้อดี

1. **ตรงกับ sidebar** - หน้ากำหนดสิทธิ์แสดงหัวข้อเหมือน menu จริง
2. **ง่ายต่อการจัดการ** - Admin เห็นหมวดหมู่ชัดเจน เช่น ถ้าจะปิด OT ทั้งหมดก็กด toggle ที่ "Overtime"
3. **ไม่ต้องแก้ code** - RoleManagement.tsx มี menuGroupLabels ครบแล้ว

---

### ไฟล์ที่ต้องแก้ไข

1. **Database Migration** - UPDATE menu_group ใน webapp_page_config

### หมายเหตุ

- ไม่กระทบ code frontend เพราะ menuGroupLabels ใน RoleManagement.tsx มี groups ครบแล้ว
- การแก้ไขนี้จะ apply กับ **ทุก role** (9 roles) โดยอัตโนมัติ
