-- Add new array columns for multiple destinations
ALTER TABLE summary_delivery_config 
  ADD COLUMN destination_line_ids TEXT[] DEFAULT '{}',
  ADD COLUMN destination_employee_ids UUID[] DEFAULT '{}';

-- Migrate existing single values to arrays
UPDATE summary_delivery_config 
SET destination_line_ids = ARRAY[destination_line_id]
WHERE destination_line_id IS NOT NULL;

UPDATE summary_delivery_config 
SET destination_employee_ids = ARRAY[destination_employee_id]
WHERE destination_employee_id IS NOT NULL;

-- Drop old single-value columns
ALTER TABLE summary_delivery_config 
  DROP COLUMN destination_type,
  DROP COLUMN destination_line_id,
  DROP COLUMN destination_employee_id;