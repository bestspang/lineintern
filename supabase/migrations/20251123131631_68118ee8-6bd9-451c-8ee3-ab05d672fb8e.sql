-- Add flexible working time fields to employees table
ALTER TABLE employees 
ADD COLUMN working_time_type text DEFAULT 'time_based',
ADD COLUMN hours_per_day numeric(4,2),
ADD COLUMN break_hours numeric(4,2) DEFAULT 1.00;

COMMENT ON COLUMN employees.working_time_type IS 'Working time calculation type: time_based (uses shift times) or hours_based (uses hours per day)';
COMMENT ON COLUMN employees.hours_per_day IS 'Number of working hours per day for hours_based type';
COMMENT ON COLUMN employees.break_hours IS 'Break/lunch hours (applicable to both types)';