-- =============================================
-- SMART MEMORY SYSTEM FOR LINE INTERN BOT
-- =============================================

-- Create memory_items table
CREATE TABLE IF NOT EXISTS public.memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('user', 'group', 'global')),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('trait', 'preference', 'topic', 'project', 'context', 'relationship', 'meta')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 10 AND 120),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 20 AND 500),
  importance_score REAL NOT NULL DEFAULT 0.5 CHECK (importance_score BETWEEN 0.0 AND 1.0),
  source_type TEXT NOT NULL CHECK (source_type IN ('dm', 'mention', 'passive', 'manual')),
  source_message_ids TEXT[] DEFAULT '{}',
  pinned BOOLEAN DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false,
  
  CONSTRAINT memory_items_user_scope_check CHECK (
    (scope = 'user' AND user_id IS NOT NULL) OR scope != 'user'
  ),
  
  CONSTRAINT memory_items_group_scope_check CHECK (
    (scope = 'group' AND group_id IS NOT NULL) OR scope != 'group'
  )
);

-- Indexes for performance
CREATE INDEX idx_memory_items_user_id ON public.memory_items(user_id) WHERE is_deleted = false;
CREATE INDEX idx_memory_items_group_id ON public.memory_items(group_id) WHERE is_deleted = false;
CREATE INDEX idx_memory_items_scope ON public.memory_items(scope) WHERE is_deleted = false;
CREATE INDEX idx_memory_items_importance ON public.memory_items(importance_score DESC) WHERE is_deleted = false;
CREATE INDEX idx_memory_items_last_used ON public.memory_items(last_used_at DESC NULLS LAST) WHERE is_deleted = false;
CREATE INDEX idx_memory_items_category ON public.memory_items(category) WHERE is_deleted = false;

-- Trigger to update updated_at
CREATE TRIGGER update_memory_items_updated_at
  BEFORE UPDATE ON public.memory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage memory_items"
  ON public.memory_items
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE public.memory_items IS 'Stores personalized memories about users, groups, and global context for the AI bot';

-- Create memory_settings table
CREATE TABLE IF NOT EXISTS public.memory_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'group', 'user')),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  memory_enabled BOOLEAN DEFAULT true,
  max_items INTEGER DEFAULT 200 CHECK (max_items > 0),
  max_items_per_user INTEGER DEFAULT 50 CHECK (max_items_per_user > 0),
  max_items_per_group INTEGER DEFAULT 100 CHECK (max_items_per_group > 0),
  auto_decay_enabled BOOLEAN DEFAULT false,
  decay_threshold_days INTEGER DEFAULT 90,
  passive_learning_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT memory_settings_global_unique CHECK (
    (scope = 'global' AND user_id IS NULL AND group_id IS NULL) OR scope != 'global'
  ),
  
  CONSTRAINT memory_settings_group_scope_check CHECK (
    (scope = 'group' AND group_id IS NOT NULL AND user_id IS NULL) OR scope != 'group'
  ),
  
  CONSTRAINT memory_settings_user_scope_check CHECK (
    (scope = 'user' AND user_id IS NOT NULL AND group_id IS NULL) OR scope != 'user'
  ),
  
  UNIQUE(scope, group_id, user_id)
);

-- Indexes
CREATE INDEX idx_memory_settings_scope ON public.memory_settings(scope);
CREATE INDEX idx_memory_settings_group_id ON public.memory_settings(group_id);
CREATE INDEX idx_memory_settings_user_id ON public.memory_settings(user_id);

-- Trigger
CREATE TRIGGER update_memory_settings_updated_at
  BEFORE UPDATE ON public.memory_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.memory_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage memory_settings"
  ON public.memory_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Insert default global settings
INSERT INTO public.memory_settings (scope, memory_enabled, max_items, max_items_per_user, max_items_per_group, auto_decay_enabled, passive_learning_enabled)
VALUES ('global', true, 200, 50, 100, false, false)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.memory_settings IS 'Configuration settings for memory system behavior';

-- Add memory_opt_out column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS memory_opt_out BOOLEAN DEFAULT false;

CREATE INDEX idx_users_memory_opt_out ON public.users(memory_opt_out) WHERE memory_opt_out = true;

COMMENT ON COLUMN public.users.memory_opt_out IS 'User opt-out flag for memory system';