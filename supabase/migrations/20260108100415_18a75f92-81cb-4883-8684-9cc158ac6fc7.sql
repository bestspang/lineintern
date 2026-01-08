-- Drop old constraint that only uses branch_code
ALTER TABLE branch_daily_reports 
  DROP CONSTRAINT IF EXISTS branch_daily_reports_report_date_branch_code_key;

-- Add new constraint with branch_name to allow same code for different branches
ALTER TABLE branch_daily_reports 
  ADD CONSTRAINT branch_daily_reports_unique_report 
  UNIQUE(report_date, branch_code, branch_name);

-- Update index for better query performance
DROP INDEX IF EXISTS idx_branch_reports_date_branch;
CREATE INDEX idx_branch_reports_date_branch_name 
  ON branch_daily_reports(report_date, branch_code, branch_name);