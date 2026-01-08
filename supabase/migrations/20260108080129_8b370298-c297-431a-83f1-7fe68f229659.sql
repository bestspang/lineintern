-- Add company_accounts column to deposit_settings for auto-detecting deposits vs reimbursements
ALTER TABLE public.deposit_settings 
ADD COLUMN IF NOT EXISTS company_accounts JSONB DEFAULT '[]';

-- Add comment explaining the column
COMMENT ON COLUMN public.deposit_settings.company_accounts IS 'Array of company bank accounts used to distinguish deposits (to company) from reimbursements (to employees). Format: [{account_number, bank_code, account_name}]';