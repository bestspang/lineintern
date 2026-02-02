
## แผนแก้ไข: เพิ่มสิทธิ์เข้าใช้งานสำหรับ HR role

### ปัญหาที่พบ
ผู้ใช้ `khwanchanok.p@goodchoose.com` มี role เป็น `hr` แต่ไม่สามารถเข้าใช้งานระบบได้เพราะ:

1. **ชื่อ menu_group ผิด**: ตั้งค่าเป็น `dashboard`, `attendance`, `schedules` แทนที่จะเป็น `Dashboard`, `Attendance`, `Schedule & Leaves`
2. **ไม่มี page configs**: role อื่นมี 59 pages แต่ `hr` มี 0 pages

### วิธีแก้ไข

**Step 1: ลบ menu config เก่าของ HR**
```sql
DELETE FROM webapp_menu_config WHERE role = 'hr';
```

**Step 2: เพิ่ม menu config ใหม่ (ชื่อถูกต้อง)**
```sql
INSERT INTO webapp_menu_config (role, menu_group, can_access) VALUES
  ('hr', 'Dashboard', true),
  ('hr', 'Attendance', true),
  ('hr', 'Schedule & Leaves', true),
  ('hr', 'Overtime', true),
  ('hr', 'Payroll', true),
  ('hr', 'Points & Rewards', true),
  ('hr', 'Deposits', true),
  ('hr', 'Receipts', true),
  ('hr', 'Management', false),
  ('hr', 'Content & Knowledge', false),
  ('hr', 'AI Features', false),
  ('hr', 'Monitoring & Tools', false),
  ('hr', 'Configuration', false);
```

**Step 3: เพิ่ม page configs (copy จาก executive)**
```sql
INSERT INTO webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT 'hr', menu_group, page_path, page_name, can_access
FROM webapp_page_config
WHERE role = 'executive';
```

### ผลลัพธ์
- ผู้ใช้ HR จะสามารถเข้าหน้า Dashboard, Attendance, Schedule & Leaves, Payroll ได้
- ระบบจะ redirect ไปหน้า Dashboard หลัง login แทนที่จะแสดง "ไม่มีสิทธิ์เข้าถึง"

### Technical Details
```text
+---------------------+     +----------------------+     +------------------+
|  User login         | --> |  ProtectedRoute      | --> | canAccessPage()  |
|  role = 'hr'        |     |  check access        |     | check menu_group |
+---------------------+     +----------+-----------+     +--------+---------+
                                       |                          |
                                       v                          v
                            +----------+-----------+    +---------+----------+
                            | getFirstAccessiblePage| <--| webapp_menu_config |
                            | returns Dashboard     |    | role='hr'          |
                            +----------+-----------+    | menu_group matching |
                                       |                 +--------------------+
                                       v
                            +----------------------+
                            |  Redirect to         |
                            |  /attendance/dashboard|
                            +----------------------+
```

### ไฟล์ที่ต้องแก้ไข
- ไม่มี code changes - เป็นการ fix database configuration เท่านั้น
