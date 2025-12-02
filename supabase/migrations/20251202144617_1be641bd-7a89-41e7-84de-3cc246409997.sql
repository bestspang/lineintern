-- Create holidays table for tracking public/company holidays
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  is_national BOOLEAN DEFAULT true,
  is_recurring BOOLEAN DEFAULT false,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, branch_id)
);

-- Enable RLS
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view holidays"
  ON public.holidays FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and owners can manage holidays"
  ON public.holidays FOR ALL
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- Add some default Thai holidays for 2024-2025
INSERT INTO public.holidays (date, name, name_en, is_national, is_recurring) VALUES
  ('2024-01-01', 'วันขึ้นปีใหม่', 'New Year''s Day', true, true),
  ('2024-04-13', 'วันสงกรานต์', 'Songkran', true, true),
  ('2024-04-14', 'วันสงกรานต์', 'Songkran', true, true),
  ('2024-04-15', 'วันสงกรานต์', 'Songkran', true, true),
  ('2024-05-01', 'วันแรงงาน', 'Labour Day', true, true),
  ('2024-12-05', 'วันพ่อแห่งชาติ', 'Father''s Day', true, true),
  ('2024-12-31', 'วันสิ้นปี', 'New Year''s Eve', true, true),
  ('2025-01-01', 'วันขึ้นปีใหม่', 'New Year''s Day', true, true),
  ('2025-04-13', 'วันสงกรานต์', 'Songkran', true, true),
  ('2025-04-14', 'วันสงกรานต์', 'Songkran', true, true),
  ('2025-04-15', 'วันสงกรานต์', 'Songkran', true, true),
  ('2025-05-01', 'วันแรงงาน', 'Labour Day', true, true),
  ('2025-12-05', 'วันพ่อแห่งชาติ', 'Father''s Day', true, true),
  ('2025-12-31', 'วันสิ้นปี', 'New Year''s Eve', true, true);

-- Create index for faster lookups
CREATE INDEX idx_holidays_date ON public.holidays(date);
CREATE INDEX idx_holidays_branch ON public.holidays(branch_id);