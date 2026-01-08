-- Add enable/disable columns for deposit and reimbursement detection
ALTER TABLE public.deposit_settings 
  ADD COLUMN IF NOT EXISTS enable_deposit_detection BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_reimbursement_detection BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.deposit_settings.enable_deposit_detection IS 'Enable/disable deposit slip detection (transfers to company accounts)';
COMMENT ON COLUMN public.deposit_settings.enable_reimbursement_detection IS 'Enable/disable reimbursement detection (transfers to employees)';