

## แผนแก้ไข: Sync ชื่อหน้าใน webapp_page_config ให้ตรงกับ Sidebar

### ปัญหาที่พบ

ชื่อหน้าใน `webapp_page_config` ไม่ตรงกับชื่อใน sidebar (`DashboardLayout.tsx`):

| page_path | Database (ผิด) | Sidebar (ถูก) |
|-----------|----------------|---------------|
| `/attendance/roles` | Roles | **Employee Roles** |
| `/attendance/summaries` | Summaries | **Daily Summaries** |

### หน้าเพิ่มเติมใน Database

หน้าเหล่านี้เป็น **dynamic routes** (child pages) ที่ไม่แสดงใน sidebar แต่ต้องมี permission config:
- `Employee Detail` → `/attendance/employees/:id`
- `Employee History` → `/attendance/employee-history/:id`
- `Employee Settings` → `/attendance/employee-settings/:id`

→ **ไม่ต้องแก้ชื่อ** เพราะเป็น sub-pages ที่ถูกต้องแล้ว

---

### วิธีแก้ไข

**Database Migration** เพื่อ UPDATE page_name ให้ตรงกับ sidebar:

```sql
-- 1. แก้ Roles → Employee Roles
UPDATE webapp_page_config 
SET page_name = 'Employee Roles'
WHERE page_path = '/attendance/roles';

-- 2. แก้ Summaries → Daily Summaries
UPDATE webapp_page_config 
SET page_name = 'Daily Summaries'
WHERE page_path = '/attendance/summaries';
```

---

### ผลลัพธ์หลังแก้ไข

| page_path | ก่อนแก้ไข | หลังแก้ไข |
|-----------|-----------|-----------|
| `/attendance/roles` | Roles | Employee Roles ✅ |
| `/attendance/summaries` | Summaries | Daily Summaries ✅ |

### ไฟล์ที่ต้องแก้ไข

1. **Database Migration** - UPDATE page_name ให้ตรงกับ sidebar

### หมายเหตุ

- การแก้ไขนี้จะ apply กับ **ทุก role** โดยอัตโนมัติ
- ไม่กระทบ code frontend

