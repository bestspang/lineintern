-- Phase 1: Enhanced FAQ & Training System
-- Create faq_logs table to track all Q&A interactions
CREATE TABLE public.faq_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  knowledge_item_ids UUID[] DEFAULT '{}',
  language TEXT DEFAULT 'en',
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  was_helpful BOOLEAN,
  feedback_text TEXT,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_faq_logs_group_id ON public.faq_logs(group_id);
CREATE INDEX idx_faq_logs_user_id ON public.faq_logs(user_id);
CREATE INDEX idx_faq_logs_created_at ON public.faq_logs(created_at DESC);
CREATE INDEX idx_faq_logs_rating ON public.faq_logs(rating) WHERE rating IS NOT NULL;

-- Create training_requests table for KB ingestion
CREATE TABLE public.training_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('url', 'document', 'text', 'faq_log')),
  source_url TEXT,
  source_content TEXT,
  extracted_items JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'approved', 'rejected')),
  reviewed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_training_requests_status ON public.training_requests(status);
CREATE INDEX idx_training_requests_created_at ON public.training_requests(created_at DESC);

CREATE TRIGGER update_training_requests_updated_at
  BEFORE UPDATE ON public.training_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add full-text search to knowledge_items
CREATE INDEX idx_knowledge_items_content_fts ON public.knowledge_items USING gin(to_tsvector('english', content));
CREATE INDEX idx_knowledge_items_title_fts ON public.knowledge_items USING gin(to_tsvector('english', title));

-- Phase 3: Safety Monitoring System
-- Create safety_rules table for customizable detection patterns
CREATE TABLE public.safety_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('url_pattern', 'keyword', 'spam_rate', 'toxicity')),
  pattern TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  action TEXT NOT NULL DEFAULT 'log' CHECK (action IN ('log', 'warn', 'notify_admin')),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'group')),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  match_count INTEGER DEFAULT 0,
  last_matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_safety_rules_enabled ON public.safety_rules(is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_safety_rules_type ON public.safety_rules(rule_type);
CREATE INDEX idx_safety_rules_group_id ON public.safety_rules(group_id);

CREATE TRIGGER update_safety_rules_updated_at
  BEFORE UPDATE ON public.safety_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Extend alerts table with richer metadata for safety monitoring
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100);
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS matched_rules UUID[];
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS source_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS action_taken TEXT;

CREATE INDEX idx_alerts_source_user_id ON public.alerts(source_user_id);
CREATE INDEX idx_alerts_risk_score ON public.alerts(risk_score DESC) WHERE risk_score IS NOT NULL;

-- RLS Policies
ALTER TABLE public.faq_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view faq_logs"
  ON public.faq_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert faq_logs"
  ON public.faq_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage training_requests"
  ON public.training_requests FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view safety_rules"
  ON public.safety_rules FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage safety_rules"
  ON public.safety_rules FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Insert default safety rules
INSERT INTO public.safety_rules (name, description, rule_type, pattern, severity, action, scope) VALUES
  ('Suspicious Links', 'Detect common scam domains', 'url_pattern', '(bit\.ly|tinyurl\.com|t\.me/.*bot|suspicious-domain\.xyz)', 'high', 'warn', 'global'),
  ('Spam Keywords', 'Detect spam and promotional content', 'keyword', '(คลิกที่นี่|click here now|limited time|free money|งานเสริม)', 'medium', 'log', 'global'),
  ('Rate Limit Burst', 'Detect message spam (>5 messages in 10 seconds)', 'spam_rate', '5:10', 'medium', 'notify_admin', 'global'),
  ('Toxic Language', 'Detect harassment and offensive content', 'toxicity', '(ควย|สัส|แม่ง|fuck|shit|asshole)', 'high', 'warn', 'global');