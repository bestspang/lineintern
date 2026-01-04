-- Add unique constraint for safe upsert on group_members
ALTER TABLE group_members
ADD CONSTRAINT group_members_user_group_unique 
UNIQUE (user_id, group_id);

-- Create helper function for syncing employee to group when branch is assigned
CREATE OR REPLACE FUNCTION sync_employee_to_group()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_group_id UUID;
BEGIN
  -- Only process if branch_id and line_user_id are set
  IF NEW.branch_id IS NOT NULL AND NEW.line_user_id IS NOT NULL THEN
    -- Find the user by line_user_id
    SELECT id INTO v_user_id FROM users WHERE line_user_id = NEW.line_user_id;
    
    -- Find the group via branch's line_group_id
    SELECT g.id INTO v_group_id 
    FROM groups g
    JOIN branches b ON g.line_group_id = b.line_group_id
    WHERE b.id = NEW.branch_id
    AND b.line_group_id IS NOT NULL;
    
    -- If both user and group found, add to group_members
    IF v_user_id IS NOT NULL AND v_group_id IS NOT NULL THEN
      INSERT INTO group_members (user_id, group_id, role, joined_at)
      VALUES (v_user_id, v_group_id, 'member', NOW())
      ON CONFLICT (user_id, group_id) DO NOTHING;
      
      -- Also set primary_group_id if not already set
      UPDATE users
      SET primary_group_id = v_group_id
      WHERE id = v_user_id AND primary_group_id IS NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-sync when employee is created or branch_id is updated
DROP TRIGGER IF EXISTS employee_branch_sync_trigger ON employees;
CREATE TRIGGER employee_branch_sync_trigger
AFTER INSERT OR UPDATE OF branch_id, line_user_id ON employees
FOR EACH ROW
EXECUTE FUNCTION sync_employee_to_group();