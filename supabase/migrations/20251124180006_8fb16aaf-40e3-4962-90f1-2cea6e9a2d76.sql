-- Add remote check-in support to employees table
ALTER TABLE employees 
ADD COLUMN allow_remote_checkin BOOLEAN DEFAULT false;

-- Add remote check-in flag to attendance_logs table
ALTER TABLE attendance_logs 
ADD COLUMN is_remote_checkin BOOLEAN DEFAULT false;

-- Add helpful comments
COMMENT ON COLUMN employees.allow_remote_checkin IS 'Allow employee to check-in from anywhere without geofence validation';
COMMENT ON COLUMN attendance_logs.is_remote_checkin IS 'Indicates if this check-in was made remotely (outside branch geofence)';