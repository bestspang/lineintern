-- Create enums
CREATE TYPE group_status AS ENUM ('active', 'left', 'error', 'pending');
CREATE TYPE group_mode AS ENUM ('helper', 'faq', 'report', 'fun', 'safety');
CREATE TYPE member_role AS ENUM ('member', 'admin', 'owner');
CREATE TYPE message_direction AS ENUM ('human', 'bot');
CREATE TYPE task_status AS ENUM ('pending', 'completed', 'cancelled');
CREATE TYPE knowledge_scope AS ENUM ('global', 'group');
CREATE TYPE alert_type AS ENUM ('scam_link', 'spam_burst', 'error', 'rate_limit', 'failed_reply');
CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high');
CREATE TYPE report_period AS ENUM ('daily', 'weekly', 'custom');

-- Admin profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Groups table
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_group_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  member_count INTEGER DEFAULT 0,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status group_status NOT NULL DEFAULT 'active',
  mode group_mode NOT NULL DEFAULT 'helper',
  language TEXT DEFAULT 'auto',
  features JSONB DEFAULT '{"summary": true, "faq": true, "todos": true, "reports": true, "safety": true}'::jsonb,
  alert_thresholds JSONB DEFAULT '{"max_spam_per_day": 10, "max_risk_links_per_day": 5}'::jsonb,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Users table (LINE users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  primary_language TEXT,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Group members junction table
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role member_role DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(group_id, user_id)
);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  direction message_direction NOT NULL,
  text TEXT NOT NULL,
  has_url BOOLEAN DEFAULT false,
  sentiment TEXT,
  risk_score INTEGER,
  command_type TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status task_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Knowledge items table
CREATE TABLE public.knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope knowledge_scope NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Alerts table
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  severity alert_severity NOT NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  details JSONB,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  period report_period NOT NULL,
  from_date TIMESTAMP WITH TIME ZONE NOT NULL,
  to_date TIMESTAMP WITH TIME ZONE NOT NULL,
  data JSONB NOT NULL,
  summary_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- App settings table
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_name TEXT DEFAULT 'Sandbox',
  default_mode group_mode DEFAULT 'helper',
  default_language TEXT DEFAULT 'auto',
  openai_model TEXT DEFAULT 'gpt-4',
  max_summary_messages INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default settings
INSERT INTO public.app_settings (environment_name) VALUES ('Sandbox');

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin access only - authenticated users can do everything)
CREATE POLICY "Authenticated users can manage profiles" ON public.profiles FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage groups" ON public.groups FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage users" ON public.users FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage group_members" ON public.group_members FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage messages" ON public.messages FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage tasks" ON public.tasks FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage knowledge_items" ON public.knowledge_items FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage alerts" ON public.alerts FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage reports" ON public.reports FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage app_settings" ON public.app_settings FOR ALL USING (auth.uid() IS NOT NULL);

-- Indexes for performance
CREATE INDEX idx_groups_status ON public.groups(status);
CREATE INDEX idx_groups_last_activity ON public.groups(last_activity_at DESC);
CREATE INDEX idx_users_line_user_id ON public.users(line_user_id);
CREATE INDEX idx_messages_group_id ON public.messages(group_id);
CREATE INDEX idx_messages_sent_at ON public.messages(sent_at DESC);
CREATE INDEX idx_tasks_group_id ON public.tasks(group_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_at ON public.tasks(due_at);
CREATE INDEX idx_alerts_group_id ON public.alerts(group_id);
CREATE INDEX idx_alerts_severity ON public.alerts(severity);
CREATE INDEX idx_alerts_resolved ON public.alerts(resolved);

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_knowledge_items_updated_at BEFORE UPDATE ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();