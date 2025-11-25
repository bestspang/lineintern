-- Step 1: Create function to update group member count
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update member_count for the affected group
  UPDATE public.groups
  SET 
    member_count = (
      SELECT COUNT(*)
      FROM public.group_members
      WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
        AND left_at IS NULL
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.group_id, OLD.group_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 2: Create trigger on group_members table
DROP TRIGGER IF EXISTS group_members_count_trigger ON public.group_members;

CREATE TRIGGER group_members_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_group_member_count();

-- Step 3: Backfill existing member counts
UPDATE public.groups g
SET 
  member_count = (
    SELECT COUNT(*)
    FROM public.group_members gm
    WHERE gm.group_id = g.id
      AND gm.left_at IS NULL
  ),
  updated_at = now()
WHERE g.member_count IS NULL 
   OR g.member_count != (
     SELECT COUNT(*)
     FROM public.group_members gm
     WHERE gm.group_id = g.id
       AND gm.left_at IS NULL
   );

-- Add helpful comment
COMMENT ON FUNCTION public.update_group_member_count() IS 
  'Automatically updates the member_count field in groups table whenever group_members changes';

COMMENT ON TRIGGER group_members_count_trigger ON public.group_members IS 
  'Maintains accurate member_count in groups table by triggering update on any membership change';