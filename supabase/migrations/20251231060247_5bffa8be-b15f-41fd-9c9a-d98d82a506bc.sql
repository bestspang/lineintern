-- Add column for enabled deposit detection groups
ALTER TABLE public.deposit_settings
ADD COLUMN IF NOT EXISTS enabled_deposit_groups text[] DEFAULT ARRAY[]::text[];

-- Add comment for documentation
COMMENT ON COLUMN public.deposit_settings.enabled_deposit_groups IS 'Array of LINE group IDs where deposit slip detection is enabled';