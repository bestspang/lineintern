

## แผนแก้ไข: เพิ่มสิทธิ์ RLS สำหรับ HR Role (แบบไม่ Hard Code)

### ปัญหาที่พบ

HR role (`khwanchanok.p@goodchoose.com`) ไม่สามารถเห็นข้อมูลหลายหน้าเพราะ:

1. **`has_admin_access()`** - รองรับเฉพาะ `admin`, `owner`
2. **`has_field_access()`** - รองรับเฉพาะ `field`, `manager`, `executive`, `moderator`

HR role ไม่อยู่ใน functions เหล่านี้ → RLS policies block การเข้าถึงข้อมูล

### วิธีแก้ไข (Dynamic Approach)

แทนที่จะ hard code roles ใน functions ให้สร้าง **permission levels table** และ function ที่อ่านค่าจาก table

**Step 1: สร้าง permission config table**

```sql
CREATE TABLE IF NOT EXISTS public.role_access_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role UNIQUE NOT NULL,
  has_admin_level boolean DEFAULT false,
  has_hr_level boolean DEFAULT false,
  has_field_level boolean DEFAULT false,
  can_view_all_data boolean DEFAULT false,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default role configurations
INSERT INTO role_access_levels (role, has_admin_level, has_hr_level, has_field_level, can_view_all_data, description) VALUES
  ('owner', true, true, true, true, 'เข้าถึงได้ทุกส่วน'),
  ('admin', true, true, true, true, 'ผู้ดูแลระบบ'),
  ('hr', false, true, true, true, 'ฝ่าย HR - จัดการข้อมูลพนักงาน'),
  ('executive', false, false, true, true, 'ผู้บริหาร - ดูรายงาน'),
  ('manager', false, false, true, true, 'หัวหน้างาน - ดูข้อมูลทีม'),
  ('moderator', false, false, true, false, 'ผู้ดูแล - จำกัดสิทธิ์'),
  ('field', false, false, true, false, 'พนักงานภาคสนาม'),
  ('user', false, false, false, false, 'ผู้ใช้ทั่วไป'),
  ('employee', false, false, false, false, 'พนักงาน - เห็นเฉพาะตัวเอง')
ON CONFLICT (role) DO NOTHING;
```

**Step 2: สร้าง function ใหม่ที่ dynamic**

```sql
-- Function: ตรวจสอบว่า user มีสิทธิ์ดูข้อมูลทั้งหมดหรือไม่
CREATE OR REPLACE FUNCTION public.can_view_all_data(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_access_levels ral ON ur.role::text = ral.role::text
    WHERE ur.user_id = check_user_id
    AND ral.can_view_all_data = true
  )
$$;
```

**Step 3: อัปเดต has_admin_access และ has_field_access ให้ใช้ table**

```sql
-- อัปเดต has_admin_access ให้อ่านจาก config table
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_access_levels ral ON ur.role::text = ral.role::text
    WHERE ur.user_id = _user_id
    AND ral.has_admin_level = true
  )
$$;

-- อัปเดต has_field_access ให้รวม HR และอ่านจาก config
CREATE OR REPLACE FUNCTION public.has_field_access(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_access_levels ral ON ur.role::text = ral.role::text
    WHERE ur.user_id = check_user_id
    AND (ral.has_field_level = true OR ral.has_hr_level = true)
  )
$$;
```

### ผลลัพธ์หลังแก้ไข

| Role | can_view_all_data | ผลลัพธ์ |
|------|-------------------|---------|
| owner | true | ✅ เห็นทุกหน้า |
| admin | true | ✅ เห็นทุกหน้า |
| **hr** | **true** | ✅ **เห็นทุกหน้า** |
| executive | true | ✅ เห็นทุกหน้า |
| manager | true | ✅ เห็นข้อมูลทีม |
| field | false | 🔒 เห็นเฉพาะที่อนุญาต |

### ข้อดีของวิธีนี้

1. **ไม่ต้อง Hard Code**: เพิ่ม/แก้ไข role permissions ผ่าน database ได้เลย
2. **Flexible**: Admin สามารถจัดการ permission levels ผ่าน UI ได้ในอนาคต
3. **Maintainable**: ไม่ต้องแก้ code เมื่อต้องการเปลี่ยน role permissions
4. **Backward Compatible**: Functions เดิมยังทำงานได้เหมือนเดิม

### ไฟล์ที่ต้องสร้าง/แก้ไข

1. **Database Migration** - สร้าง `role_access_levels` table และ update functions
2. ไม่มี Frontend code changes - ทำงานผ่าน database functions

