-- Enable realtime for attendance_logs table
ALTER TABLE attendance_logs REPLICA IDENTITY FULL;