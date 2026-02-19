ALTER TABLE point_rewards ADD COLUMN daily_pull_limit integer DEFAULT NULL;
COMMENT ON COLUMN point_rewards.daily_pull_limit IS 'Max gacha pulls per day per employee. NULL = unlimited.';