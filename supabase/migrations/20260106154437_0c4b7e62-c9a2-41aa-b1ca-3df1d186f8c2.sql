-- =============================================
-- RECEIPTS MODULE - Database Schema
-- =============================================

-- Plans & Quotas (create first as it's referenced by subscriptions)
CREATE TABLE public.receipt_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ai_receipts_limit INT NOT NULL DEFAULT 8,
  businesses_limit INT NOT NULL DEFAULT 1,
  price_thb NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Businesses for receipts (separate from branches)
CREATE TABLE public.receipt_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  line_user_id TEXT,
  name TEXT NOT NULL,
  tax_id TEXT,
  currency TEXT DEFAULT 'THB',
  timezone TEXT DEFAULT 'Asia/Bangkok',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Main receipts table
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.receipt_businesses(id) ON DELETE SET NULL,
  line_user_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'line',
  status TEXT DEFAULT 'needs_review',
  
  receipt_date DATE,
  vendor TEXT,
  description TEXT,
  category TEXT,
  currency TEXT DEFAULT 'THB',
  subtotal NUMERIC,
  vat NUMERIC,
  total NUMERIC,
  payment_method TEXT,
  tags TEXT[],
  
  confidence JSONB,
  warnings TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Receipt files (supports multiple files per receipt)
CREATE TABLE public.receipt_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID REFERENCES public.receipts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  file_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories (preset + custom per business)
CREATE TABLE public.receipt_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.receipt_businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_th TEXT,
  icon TEXT,
  is_preset BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User subscriptions
CREATE TABLE public.receipt_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT UNIQUE NOT NULL,
  plan_id TEXT REFERENCES public.receipt_plans(id) DEFAULT 'free',
  current_period_start DATE DEFAULT CURRENT_DATE,
  current_period_end DATE DEFAULT (CURRENT_DATE + INTERVAL '1 month'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Usage tracking per month
CREATE TABLE public.receipt_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT NOT NULL,
  period_yyyymm TEXT NOT NULL,
  ai_receipts_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(line_user_id, period_yyyymm)
);

-- =============================================
-- RLS Policies
-- =============================================

ALTER TABLE public.receipt_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_usage ENABLE ROW LEVEL SECURITY;

-- Plans are public readable
CREATE POLICY "Plans are publicly readable"
  ON public.receipt_plans FOR SELECT
  USING (true);

-- Businesses policies
CREATE POLICY "Users can view their own businesses"
  ON public.receipt_businesses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own businesses"
  ON public.receipt_businesses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own businesses"
  ON public.receipt_businesses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own businesses"
  ON public.receipt_businesses FOR DELETE
  USING (auth.uid() = user_id);

-- Receipts policies (LINE user based + auth user)
CREATE POLICY "Users can view receipts of their businesses"
  ON public.receipts FOR SELECT
  USING (
    business_id IN (SELECT id FROM public.receipt_businesses WHERE user_id = auth.uid())
    OR line_user_id IN (SELECT line_user_id FROM public.receipt_businesses WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can manage all receipts"
  ON public.receipts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Receipt files policies
CREATE POLICY "Users can view files of their receipts"
  ON public.receipt_files FOR SELECT
  USING (
    receipt_id IN (
      SELECT id FROM public.receipts WHERE 
        business_id IN (SELECT id FROM public.receipt_businesses WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Service role can manage all receipt files"
  ON public.receipt_files FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Categories policies
CREATE POLICY "Users can view preset and their own categories"
  ON public.receipt_categories FOR SELECT
  USING (is_preset = true OR business_id IN (SELECT id FROM public.receipt_businesses WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage their own categories"
  ON public.receipt_categories FOR ALL
  USING (business_id IN (SELECT id FROM public.receipt_businesses WHERE user_id = auth.uid()));

-- Subscriptions policies  
CREATE POLICY "Users can view their subscription via LINE"
  ON public.receipt_subscriptions FOR SELECT
  USING (line_user_id IN (SELECT line_user_id FROM public.receipt_businesses WHERE user_id = auth.uid()));

CREATE POLICY "Service role can manage subscriptions"
  ON public.receipt_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Usage policies
CREATE POLICY "Users can view their usage via LINE"
  ON public.receipt_usage FOR SELECT
  USING (line_user_id IN (SELECT line_user_id FROM public.receipt_businesses WHERE user_id = auth.uid()));

CREATE POLICY "Service role can manage usage"
  ON public.receipt_usage FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================
-- Insert Default Data
-- =============================================

-- Default plans
INSERT INTO public.receipt_plans (id, name, ai_receipts_limit, businesses_limit, price_thb) VALUES
  ('free', 'Free', 8, 1, 0),
  ('lite', 'Lite', 30, 2, 199),
  ('pro', 'Pro', 100, 3, 499),
  ('scale', 'Scale', 1000, 5, 1499);

-- Preset categories (global, no business_id)
INSERT INTO public.receipt_categories (name, name_th, icon, is_preset) VALUES
  ('Food & Dining', 'อาหาร', '🍔', true),
  ('Transportation', 'เดินทาง', '🚗', true),
  ('Office Supplies', 'เครื่องใช้สำนักงาน', '📎', true),
  ('Utilities', 'สาธารณูปโภค', '💡', true),
  ('Software', 'ซอฟต์แวร์', '💻', true),
  ('Marketing', 'การตลาด', '📢', true),
  ('Professional Services', 'บริการวิชาชีพ', '👔', true),
  ('Other', 'อื่นๆ', '📦', true);

-- =============================================
-- Indexes for performance
-- =============================================

CREATE INDEX idx_receipts_line_user_id ON public.receipts(line_user_id);
CREATE INDEX idx_receipts_business_id ON public.receipts(business_id);
CREATE INDEX idx_receipts_status ON public.receipts(status);
CREATE INDEX idx_receipts_receipt_date ON public.receipts(receipt_date);
CREATE INDEX idx_receipt_files_receipt_id ON public.receipt_files(receipt_id);
CREATE INDEX idx_receipt_usage_period ON public.receipt_usage(line_user_id, period_yyyymm);
CREATE INDEX idx_receipt_businesses_line_user_id ON public.receipt_businesses(line_user_id);

-- =============================================
-- Updated_at trigger function (reuse existing or create)
-- =============================================

CREATE OR REPLACE FUNCTION public.update_receipts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_receipts_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_receipts_updated_at();

CREATE TRIGGER update_receipt_businesses_updated_at
  BEFORE UPDATE ON public.receipt_businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_receipts_updated_at();

CREATE TRIGGER update_receipt_subscriptions_updated_at
  BEFORE UPDATE ON public.receipt_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_receipts_updated_at();

CREATE TRIGGER update_receipt_usage_updated_at
  BEFORE UPDATE ON public.receipt_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_receipts_updated_at();