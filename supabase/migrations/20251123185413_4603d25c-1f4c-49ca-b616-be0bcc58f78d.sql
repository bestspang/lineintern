-- Add admin audit trail fields to attendance_logs
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS performed_by_admin_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS admin_notes text;

COMMENT ON COLUMN attendance_logs.performed_by_admin_id IS 
'ID ของ admin ที่กด check-in/out ให้พนักงาน (null ถ้าพนักงานกดเอง)';

COMMENT ON COLUMN attendance_logs.admin_notes IS 
'หมายเหตุจาก admin เมื่อกด check-in/out ให้พนักงาน';

-- Add RLS policy for admin check-out
CREATE POLICY "Admins can insert attendance logs for employees"
ON attendance_logs
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
);
