
## แผนแก้ไข: เพิ่มหน้าที่ขาดหายไปใน webapp_page_config

### ปัญหาที่พบ
ระบบมีหน้า Attendance ทั้งหมด **36 หน้า** แต่ `webapp_page_config` มีแค่ **28 หน้า** ทำให้ไม่สามารถกำหนดสิทธิ์ได้สำหรับหน้าที่ขาดหายไป

### หน้าที่ขาดหายไป (8 หน้า)
| Page Name | Path | หมายเหตุ |
|-----------|------|----------|
| Birthdays | /attendance/birthdays | วันเกิดพนักงาน |
| Employee Detail | /attendance/employees/:id | รายละเอียดพนักงาน |
| Employee History | /attendance/employee-history/:id | ประวัติพนักงาน |
| Employee Settings | /attendance/employee-settings/:id | ตั้งค่าพนักงาน |
| Point Rules | /attendance/point-rules | กฎการให้คะแนน |
| Schedules | /attendance/schedules | ตารางงาน |
| Shift Templates | /attendance/shift-templates | เทมเพลตกะงาน |
| Work History | /attendance/work-history | ประวัติการทำงาน |

### วิธีแก้ไข

**เพิ่ม page configs สำหรับทุก role (9 roles × 8 pages = 72 records)**

```sql
-- Insert missing Attendance pages for ALL roles
INSERT INTO webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT r.role, 'Attendance', p.page_path, p.page_name, 
       CASE WHEN r.role IN ('owner', 'admin', 'hr') THEN true ELSE false END
FROM (
  VALUES 
    ('/attendance/birthdays', 'Birthdays'),
    ('/attendance/employees/:id', 'Employee Detail'),
    ('/attendance/employee-history/:id', 'Employee History'),
    ('/attendance/employee-settings/:id', 'Employee Settings'),
    ('/attendance/point-rules', 'Point Rules'),
    ('/attendance/schedules', 'Schedules'),
    ('/attendance/shift-templates', 'Shift Templates'),
    ('/attendance/work-history', 'Work History')
) AS p(page_path, page_name)
CROSS JOIN (
  SELECT DISTINCT role FROM webapp_page_config
) AS r(role)
ON CONFLICT DO NOTHING;
```

### ผลลัพธ์
- ทุก role จะมี **36 หน้า** ใน Attendance แทน 28 หน้า
- Admin สามารถเปิด/ปิด access ได้สำหรับหน้าที่เพิ่มใหม่
- หน้า Employee Detail, Employee Settings, Schedules จะแสดงในการตั้งค่าสิทธิ์

### ไฟล์ที่ต้องแก้ไข
- Database migration เท่านั้น - ไม่มี code changes
