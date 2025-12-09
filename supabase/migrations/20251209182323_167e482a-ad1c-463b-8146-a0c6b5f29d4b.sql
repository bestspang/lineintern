-- Phase 1: Delete duplicate records, keeping the one with actual data
-- First, identify and delete duplicates - keep records with actual response data
DELETE FROM response_analytics r1
WHERE r1.id IN (
  SELECT r1.id
  FROM response_analytics r1
  INNER JOIN response_analytics r2
  ON r1.user_id = r2.user_id
    AND r1.group_id = r2.group_id
    AND r1.date = r2.date
    AND r1.id != r2.id
  WHERE (
    -- r2 has better data than r1
    (r2.total_replies_received > r1.total_replies_received)
    OR (r2.avg_response_time_seconds IS NOT NULL AND r1.avg_response_time_seconds IS NULL)
    OR (r2.total_replies_received = r1.total_replies_received 
        AND r2.avg_response_time_seconds IS NOT NULL 
        AND r1.avg_response_time_seconds IS NULL)
    -- If same quality, keep newer
    OR (r2.total_replies_received = r1.total_replies_received 
        AND COALESCE(r2.avg_response_time_seconds, 0) = COALESCE(r1.avg_response_time_seconds, 0)
        AND r2.created_at > r1.created_at)
  )
);

-- Add UNIQUE constraint to prevent future duplicates (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_user_group_date'
  ) THEN
    ALTER TABLE response_analytics 
    ADD CONSTRAINT unique_user_group_date UNIQUE (user_id, group_id, date);
  END IF;
END $$;