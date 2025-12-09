-- =============================================
-- BROADCAST MANAGEMENT SYSTEM TABLES
-- =============================================

-- 1. Broadcasts - Main broadcast configuration
CREATE TABLE public.broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'text_image')),
  content TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed', 'paused', 'cancelled')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('daily', 'every_3_days', 'weekly', 'monthly', 'yearly')),
  recurrence_end_date TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Broadcast Recipients - Who receives the broadcast
CREATE TABLE public.broadcast_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('user', 'group', 'employee')),
  recipient_id UUID NOT NULL,
  line_id TEXT,
  recipient_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Broadcast Logs - Detailed delivery tracking
CREATE TABLE public.broadcast_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.broadcast_recipients(id) ON DELETE SET NULL,
  line_id TEXT,
  recipient_name TEXT,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('sent', 'failed', 'rate_limited')),
  error_message TEXT,
  line_response JSONB,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Broadcast Templates - Reusable message templates
CREATE TABLE public.broadcast_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'text_image')),
  content TEXT,
  image_url TEXT,
  category TEXT DEFAULT 'general',
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Recipient Groups - Saved groups of recipients
CREATE TABLE public.recipient_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  member_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. Recipient Group Members - Members of recipient groups
CREATE TABLE public.recipient_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.recipient_groups(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL CHECK (member_type IN ('user', 'group', 'employee')),
  member_id UUID NOT NULL,
  line_id TEXT,
  member_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(group_id, member_type, member_id)
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_broadcasts_status ON public.broadcasts(status);
CREATE INDEX idx_broadcasts_scheduled_at ON public.broadcasts(scheduled_at);
CREATE INDEX idx_broadcasts_next_run_at ON public.broadcasts(next_run_at);
CREATE INDEX idx_broadcast_recipients_broadcast_id ON public.broadcast_recipients(broadcast_id);
CREATE INDEX idx_broadcast_recipients_status ON public.broadcast_recipients(status);
CREATE INDEX idx_broadcast_logs_broadcast_id ON public.broadcast_logs(broadcast_id);
CREATE INDEX idx_recipient_group_members_group_id ON public.recipient_group_members(group_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Enable RLS
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipient_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipient_group_members ENABLE ROW LEVEL SECURITY;

-- Broadcasts policies
CREATE POLICY "Admins can manage broadcasts" ON public.broadcasts
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Service role can manage broadcasts" ON public.broadcasts
  FOR ALL USING (true) WITH CHECK (true);

-- Broadcast Recipients policies
CREATE POLICY "Admins can manage broadcast_recipients" ON public.broadcast_recipients
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Service role can manage broadcast_recipients" ON public.broadcast_recipients
  FOR ALL USING (true) WITH CHECK (true);

-- Broadcast Logs policies
CREATE POLICY "Admins can view broadcast_logs" ON public.broadcast_logs
  FOR SELECT USING (has_admin_access(auth.uid()));

CREATE POLICY "Service role can manage broadcast_logs" ON public.broadcast_logs
  FOR ALL USING (true) WITH CHECK (true);

-- Broadcast Templates policies
CREATE POLICY "Admins can manage broadcast_templates" ON public.broadcast_templates
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Authenticated can view templates" ON public.broadcast_templates
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);

-- Recipient Groups policies
CREATE POLICY "Admins can manage recipient_groups" ON public.recipient_groups
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- Recipient Group Members policies
CREATE POLICY "Admins can manage recipient_group_members" ON public.recipient_group_members
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- =============================================
-- TRIGGERS
-- =============================================

-- Update member count on recipient_group_members changes
CREATE OR REPLACE FUNCTION public.update_recipient_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.recipient_groups
  SET member_count = (
    SELECT COUNT(*) FROM public.recipient_group_members
    WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.group_id, OLD.group_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_recipient_group_count
AFTER INSERT OR DELETE ON public.recipient_group_members
FOR EACH ROW EXECUTE FUNCTION public.update_recipient_group_member_count();

-- Updated_at trigger for broadcasts
CREATE TRIGGER update_broadcasts_updated_at
BEFORE UPDATE ON public.broadcasts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for broadcast_templates
CREATE TRIGGER update_broadcast_templates_updated_at
BEFORE UPDATE ON public.broadcast_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for recipient_groups
CREATE TRIGGER update_recipient_groups_updated_at
BEFORE UPDATE ON public.recipient_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();