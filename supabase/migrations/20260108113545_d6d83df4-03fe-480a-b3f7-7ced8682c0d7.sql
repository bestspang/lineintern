-- Add new columns for detailed report data
ALTER TABLE branch_daily_reports 
ADD COLUMN IF NOT EXISTS stock_lemon INTEGER,
ADD COLUMN IF NOT EXISTS top_lemonade JSONB,
ADD COLUMN IF NOT EXISTS top_slurpee JSONB,
ADD COLUMN IF NOT EXISTS cup_size_s INTEGER,
ADD COLUMN IF NOT EXISTS cup_size_m INTEGER,
ADD COLUMN IF NOT EXISTS lineman_orders INTEGER;