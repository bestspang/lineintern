-- Step 1: Create role_access_levels table for dynamic permission management
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

-- Enable RLS on the table (read-only for authenticated users)
ALTER TABLE public.role_access_levels ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (needed for RLS function checks)
CREATE POLICY "Anyone can read role_access_levels"
ON public.role_access_levels
FOR SELECT
TO authenticated
USING (true);

-- Only admin/owner can modify
CREATE POLICY "Admin can manage role_access_levels"
ON public.role_access_levels
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
);

-- Step 2: Insert default role configurations
INSERT INTO public.role_access_levels (role, has_admin_level, has_hr_level, has_field_level, can_view_all_data, description) VALUES
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

-- Step 3: Create new dynamic function - can_view_all_data
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

-- Step 4: Update has_admin_access to use config table (dynamic)
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

-- Step 5: Update has_field_access to include HR level (dynamic)
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

-- Step 6: Update has_hr_access to use config table (dynamic)
CREATE OR REPLACE FUNCTION public.has_hr_access(_user_id uuid)
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
    AND ral.has_hr_level = true
  )
$$;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_role_access_levels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_role_access_levels_updated_at
BEFORE UPDATE ON public.role_access_levels
FOR EACH ROW
EXECUTE FUNCTION public.update_role_access_levels_updated_at();