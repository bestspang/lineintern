-- Add shift time and reminder preferences to employees table
ALTER TABLE employees 
ADD COLUMN shift_start_time time,
ADD COLUMN shift_end_time time,
ADD COLUMN reminder_preferences jsonb DEFAULT '{
  "check_in_reminder_enabled": true,
  "check_out_reminder_enabled": true,
  "notification_type": "private",
  "grace_period_minutes": 15,
  "check_out_reminder_after_minutes": 15
}'::jsonb;

-- Create attendance_reminders table for tracking sent reminders
CREATE TABLE attendance_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  reminder_type text NOT NULL CHECK (reminder_type IN ('check_in', 'check_out')),
  reminder_date date NOT NULL,
  scheduled_time timestamptz NOT NULL,
  sent_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  notification_type text NOT NULL CHECK (notification_type IN ('private', 'group', 'both')),
  line_message_id text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_attendance_reminders_employee_date 
ON attendance_reminders(employee_id, reminder_date);

CREATE INDEX idx_attendance_reminders_status_scheduled 
ON attendance_reminders(status, scheduled_time) 
WHERE status = 'pending';

CREATE INDEX idx_employees_shift_times 
ON employees(shift_start_time, shift_end_time) 
WHERE shift_start_time IS NOT NULL;

-- Enable RLS on attendance_reminders
ALTER TABLE attendance_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for attendance_reminders
CREATE POLICY "Admins can manage attendance_reminders"
ON attendance_reminders
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view attendance_reminders"
ON attendance_reminders
FOR SELECT
TO authenticated
USING (true);

-- Add comment for documentation
COMMENT ON TABLE attendance_reminders IS 'Tracks attendance check-in and check-out reminders sent to employees via LINE';
COMMENT ON COLUMN employees.shift_start_time IS 'Employee shift start time (e.g., 09:00:00)';
COMMENT ON COLUMN employees.shift_end_time IS 'Employee shift end time (e.g., 18:00:00)';
COMMENT ON COLUMN employees.reminder_preferences IS 'JSON configuration for attendance reminders including notification type and grace periods';