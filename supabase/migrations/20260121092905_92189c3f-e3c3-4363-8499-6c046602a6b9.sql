-- Add columns for tracking unpaid leave in payroll_records
ALTER TABLE public.payroll_records
ADD COLUMN IF NOT EXISTS unpaid_leave_days numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS leave_deduction numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS paid_leave_days numeric DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.payroll_records.unpaid_leave_days IS 'Number of unpaid leave days in the period';
COMMENT ON COLUMN public.payroll_records.leave_deduction IS 'Amount deducted from salary for unpaid leave';
COMMENT ON COLUMN public.payroll_records.paid_leave_days IS 'Number of paid leave days (vacation, sick, personal with balance)';