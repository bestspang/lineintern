-- Phase 2: Fix duplicate records and add UNIQUE constraint

-- Step 1: Delete duplicate records, keeping the most recent one
DELETE FROM response_analytics ra1
USING response_analytics ra2
WHERE ra1.user_id = ra2.user_id
  AND ra1.group_id = ra2.group_id
  AND ra1.date = ra2.date
  AND ra1.created_at < ra2.created_at;

-- Step 2: Add UNIQUE constraint to prevent future duplicates
ALTER TABLE response_analytics 
ADD CONSTRAINT unique_response_analytics_user_group_date 
UNIQUE (user_id, group_id, date);