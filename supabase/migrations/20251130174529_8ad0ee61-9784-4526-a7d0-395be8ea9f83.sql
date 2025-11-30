-- Add bank account fields to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_branch TEXT;