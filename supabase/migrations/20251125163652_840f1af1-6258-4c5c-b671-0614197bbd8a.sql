-- Create view for active branches (non-deleted)
CREATE VIEW active_branches AS
SELECT * FROM branches WHERE is_deleted = false;