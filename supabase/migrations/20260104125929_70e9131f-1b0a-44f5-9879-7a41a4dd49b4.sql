-- Add primary_group_id to users table for primary branch/group assignment
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS primary_group_id UUID REFERENCES public.groups(id);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_primary_group ON public.users(primary_group_id);

-- Comment for documentation
COMMENT ON COLUMN public.users.primary_group_id IS 'The primary group/branch for this user, auto-assigned from first branch message or manually set by admin';