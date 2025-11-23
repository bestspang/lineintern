-- Add indexes for performance on live attendance queries
CREATE INDEX IF NOT EXISTS idx_attendance_logs_server_time 
ON attendance_logs(server_time);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_server_time 
ON attendance_logs(employee_id, server_time);

-- Enable realtime for attendance_logs table
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_logs;