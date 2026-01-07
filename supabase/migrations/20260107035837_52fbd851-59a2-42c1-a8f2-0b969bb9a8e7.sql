-- Create vendor_category_hints table for smarter AI category suggestions
CREATE TABLE IF NOT EXISTS public.vendor_category_hints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_pattern TEXT NOT NULL,
  suggested_category TEXT NOT NULL,
  confidence REAL DEFAULT 0.8,
  source TEXT DEFAULT 'manual',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.vendor_category_hints ENABLE ROW LEVEL SECURITY;

-- Public read access (no user-specific data)
CREATE POLICY "Anyone can read vendor hints"
ON public.vendor_category_hints FOR SELECT
USING (true);

-- Only service role can modify (via edge functions)
CREATE POLICY "Service role can manage vendor hints"
ON public.vendor_category_hints FOR ALL
USING (auth.role() = 'service_role');

-- Create index for pattern matching
CREATE INDEX idx_vendor_category_hints_pattern ON public.vendor_category_hints (vendor_pattern);

-- Pre-populate with common Thai vendors
INSERT INTO public.vendor_category_hints (vendor_pattern, suggested_category, confidence) VALUES
('7-eleven|seven|เซเว่น|เซเว่นอีเลฟเว่น', 'food', 0.9),
('lotus|โลตัส|makro|แม็คโคร|big c|บิ๊กซี|tops|ท็อปส์', 'food', 0.85),
('grab|แกร็บ|grabfood', 'food', 0.8),
('lineman|ไลน์แมน|foodpanda|ฟู้ดแพนด้า', 'food', 0.8),
('starbucks|สตาร์บัคส์|amazon|อเมซอน|cafe|กาแฟ', 'food', 0.85),
('bolt|grab transport|indriver', 'transport', 0.9),
('bts|mrt|รถไฟฟ้า|rabbit|แรบบิท', 'transport', 0.95),
('shell|ปตท|ptt|esso|caltex|บางจาก|น้ำมัน', 'transport', 0.9),
('ais|true|dtac|ทรู|ดีแทค', 'utilities', 0.95),
('pea|mea|การไฟฟ้า|ไฟฟ้า|ประปา|water', 'utilities', 0.95),
('office mate|ออฟฟิศเมท|b2s|บีทูเอส', 'office', 0.9),
('major|sf|เมเจอร์|cinema|โรงหนัง', 'entertainment', 0.9),
('netflix|spotify|youtube|disney', 'entertainment', 0.95)
ON CONFLICT DO NOTHING;

-- Create updated_at trigger
CREATE TRIGGER update_vendor_category_hints_updated_at
BEFORE UPDATE ON public.vendor_category_hints
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();