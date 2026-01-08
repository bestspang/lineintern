
-- Drop the old unique constraint that only uses report_date and branch_code
ALTER TABLE branch_daily_reports DROP CONSTRAINT IF EXISTS unique_branch_date;
