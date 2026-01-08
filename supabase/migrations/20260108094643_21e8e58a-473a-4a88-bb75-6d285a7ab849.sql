-- Create branch_daily_reports table for storing parsed daily sales reports
CREATE TABLE public.branch_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Report identification
  report_date DATE NOT NULL,
  branch_code TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  
  -- Sales metrics
  sales DECIMAL(12,2) DEFAULT 0,
  sales_target DECIMAL(12,2) DEFAULT 0,
  diff_target DECIMAL(12,2) DEFAULT 0,
  diff_target_percent DECIMAL(6,2) DEFAULT 0,
  tc INTEGER DEFAULT 0,
  
  -- Inventory
  stock_lemon INTEGER DEFAULT 0,
  
  -- Cup sales
  cup_size_s INTEGER DEFAULT 0,
  cup_size_m INTEGER DEFAULT 0,
  
  -- Additional products
  dried_lemon INTEGER DEFAULT 0,
  chili_salt INTEGER DEFAULT 0,
  honey_bottle INTEGER DEFAULT 0,
  snacks INTEGER DEFAULT 0,
  bottled_water INTEGER DEFAULT 0,
  lineman_orders INTEGER DEFAULT 0,
  
  -- Top sellers (stored as JSONB for flexibility)
  top_lemonade JSONB DEFAULT '[]'::jsonb,
  top_slurpee JSONB DEFAULT '[]'::jsonb,
  merchandise_sold JSONB DEFAULT '[]'::jsonb,
  
  -- Source tracking
  source_message_id UUID,
  source_group_id UUID,
  reported_by_user_id UUID,
  
  -- Metadata
  raw_message_text TEXT,
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicates: one report per branch per day
  CONSTRAINT unique_branch_date UNIQUE(report_date, branch_code)
);

-- Indexes for fast queries
CREATE INDEX idx_branch_reports_date ON public.branch_daily_reports(report_date);
CREATE INDEX idx_branch_reports_branch ON public.branch_daily_reports(branch_code);
CREATE INDEX idx_branch_reports_date_branch ON public.branch_daily_reports(report_date, branch_code);
CREATE INDEX idx_branch_reports_source_group ON public.branch_daily_reports(source_group_id);

-- Enable RLS
ALTER TABLE public.branch_daily_reports ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated read branch reports" 
ON public.branch_daily_reports 
FOR SELECT 
TO authenticated 
USING (true);

-- Allow service role to insert/update (from edge function)
CREATE POLICY "Allow service role write branch reports" 
ON public.branch_daily_reports 
FOR ALL 
TO service_role 
USING (true);

-- Create updated_at trigger
CREATE TRIGGER update_branch_reports_updated_at
BEFORE UPDATE ON public.branch_daily_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();