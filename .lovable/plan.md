
## แผนสร้างระบบ Admin สร้าง Account ให้พนักงาน

### ปัญหาปัจจุบัน
ระบบ User Management ปัจจุบันทำได้แค่กำหนด Role ให้ผู้ใช้ที่ลงทะเบียน (Sign Up) เองแล้วเท่านั้น ทำให้ Admin ไม่สามารถสร้าง account ให้พนักงานได้โดยตรง

### สิ่งที่จะสร้าง

**1. Edge Function `admin-create-user`**
- รับข้อมูล: employee_id, email, password, role
- ใช้ Supabase Admin API สร้าง auth user
- บันทึก role ลง `user_roles` table
- ส่งผลลัพธ์กลับ

**2. ปรับปรุงหน้า User Management**
- เพิ่มปุ่ม "สร้าง Account จากพนักงาน"
- Dialog ใหม่ที่มี:
  - Searchable dropdown เลือกพนักงานจากระบบ (employees table)
  - ช่อง Email
  - ช่อง Password + Confirm Password
  - เลือก Role
- เรียก edge function เมื่อกด Submit

### ข้อมูลที่จะแสดงใน Dropdown
| รหัส | ชื่อพนักงาน |
|------|-------------|
| 001 | Baze |
| 000 | Best |
| 002 | Fern |
| ... | ... |

### Flow การทำงาน

```text
+---------------------------+
|   Admin กดปุ่ม            |
|  "สร้าง Account จากพนักงาน" |
+-------------+-------------+
              |
              v
+---------------------------+
|   Dialog เปิดขึ้น          |
| - เลือกพนักงานจากระบบ      |
| - กรอก Email              |
| - กรอก Password           |
| - เลือก Role              |
+-------------+-------------+
              |
              v
+---------------------------+
|  Edge Function            |
|  admin-create-user        |
| - สร้าง auth user         |
| - เพิ่ม role              |
+-------------+-------------+
              |
              v
+---------------------------+
|  แสดงผลสำเร็จ              |
|  รายชื่อ update อัตโนมัติ   |
+---------------------------+
```

### ความปลอดภัย
- Edge function ตรวจสอบสิทธิ์ admin/owner ก่อนสร้าง user
- Password ถูก hash โดย Supabase Auth โดยอัตโนมัติ
- ไม่เก็บ password ใน database อื่น

### Technical Details

**Edge Function Structure:**
```typescript
// supabase/functions/admin-create-user/index.ts
- Validate caller has admin/owner role
- Use supabase.auth.admin.createUser()
- Insert into user_roles table
- Return created user info
```

**UI Changes:**
- New state for create dialog
- Fetch employees query
- Form validation (email format, password match)
- Call edge function on submit
