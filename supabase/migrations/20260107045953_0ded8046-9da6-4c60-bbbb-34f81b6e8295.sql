-- Add branch_source column to receipts table
-- Values: 'group_mapping', 'submitter', 'manual', null
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS branch_source TEXT;

-- Add comment for documentation
COMMENT ON COLUMN receipts.branch_source IS 'Source of branch_id: group_mapping, submitter, manual, or null';